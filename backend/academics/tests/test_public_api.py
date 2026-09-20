"""academics.public_api — what a visitor who isn't signed in can read, and
(as importantly) what they can't. See docs/core/public_access.md."""

import pytest

from academics.models import Class, School, Subject, SubjectGroup, Topic
from accounts.models import Role, TutorProfile, User
from lessons.models import Lesson, LessonType
from tutoring.models import TutorSubjectAssignment

pytestmark = pytest.mark.django_db


@pytest.fixture
def school():
    return School.objects.create(name='Ahead School')


def _class(school, name, order_index, is_public):
    return Class.objects.create(
        school=school, name=name, order_index=order_index, academic_year='2025/2026', is_public=is_public
    )


def _subject_with_lesson(school_class, name, order_index=0, lesson_title='Intro'):
    subject = Subject.objects.create(school_class=school_class, name=name, order_index=order_index)
    topic = Topic.objects.create(subject=subject, title=f'{name} topic', order_index=1)
    lesson = Lesson.objects.create(
        topic=topic,
        order_index=1,
        title=lesson_title,
        content='Some theory',
        lesson_type=LessonType.THEORY,
        grading_type='binary',
    )
    return subject, topic, lesson


@pytest.fixture
def public_class(school):
    return _class(school, '1', 1, is_public=True)


@pytest.fixture
def private_class(school):
    return _class(school, '2', 2, is_public=False)


def test_class_is_not_public_by_default(school):
    school_class = Class.objects.create(school=school, name='9', order_index=9, academic_year='2025/2026')
    assert school_class.is_public is False


def test_list_subjects_only_from_public_classes(api_client, public_class, private_class):
    public_subject, _, _ = _subject_with_lesson(public_class, 'Public math')
    _subject_with_lesson(private_class, 'Private math')

    response = api_client.get('/public/subjects')

    assert response.status_code == 200
    assert [s['id'] for s in response.json()] == [public_subject.id]


def test_list_subjects_leaves_out_subjects_without_lessons(api_client, public_class):
    with_lessons, _, _ = _subject_with_lesson(public_class, 'Has lessons')
    Subject.objects.create(school_class=public_class, name='Empty')

    response = api_client.get('/public/subjects')

    assert [s['id'] for s in response.json()] == [with_lessons.id]


def test_list_subjects_is_ordered_by_class_then_subject_order(api_client, school):
    second_class = _class(school, '2', 2, is_public=True)
    first_class = _class(school, '1', 1, is_public=True)
    later, _, _ = _subject_with_lesson(second_class, 'Later class', order_index=1)
    b, _, _ = _subject_with_lesson(first_class, 'B', order_index=2)
    a, _, _ = _subject_with_lesson(first_class, 'A', order_index=1)

    response = api_client.get('/public/subjects')

    assert [s['id'] for s in response.json()] == [a.id, b.id, later.id]


def test_subject_payload_exposes_no_teacher_or_email(api_client, public_class):
    subject, _, _ = _subject_with_lesson(public_class, 'Math')
    tutor_user = User.objects.create_user(email='secret-tutor@example.com', role=Role.TUTOR)
    tutor = TutorProfile.objects.create(user=tutor_user)
    TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)

    response = api_client.get('/public/subjects')

    assert response.status_code == 200
    assert 'secret-tutor@example.com' not in response.content.decode()
    assert set(response.json()[0]) == {'id', 'name', 'icon', 'group_id', 'is_marked'}


def test_get_subject_topics_and_lessons_of_a_public_class(api_client, public_class):
    subject, topic, lesson = _subject_with_lesson(public_class, 'Math')

    detail = api_client.get(f'/public/subjects/{subject.id}')
    topics = api_client.get(f'/public/subjects/{subject.id}/topics')
    lessons = api_client.get(f'/public/subjects/{subject.id}/lessons')

    assert detail.status_code == 200
    assert detail.json()['name'] == 'Math'
    assert [t['id'] for t in topics.json()] == [topic.id]
    (lesson_row,) = lessons.json()
    assert lesson_row['id'] == lesson.id
    # A visitor has no StudentLesson, so nothing about progress comes back.
    assert lesson_row['student_lesson_id'] is None
    assert lesson_row['status'] is None
    assert lesson_row['is_favorite'] is False


def test_subject_endpoints_404_for_a_private_class(api_client, private_class):
    subject, _, _ = _subject_with_lesson(private_class, 'Private math')

    for path in ('', '/topics', '/lessons'):
        assert api_client.get(f'/public/subjects/{subject.id}{path}').status_code == 404


def test_subject_endpoints_404_for_an_unknown_id(api_client):
    for path in ('', '/topics', '/lessons'):
        assert api_client.get(f'/public/subjects/999999{path}').status_code == 404


def test_get_lesson_of_a_public_class_is_read_only_content(api_client, public_class):
    subject, topic, lesson = _subject_with_lesson(public_class, 'Math', lesson_title='Fractions')

    response = api_client.get(f'/public/lessons/{lesson.id}')

    assert response.status_code == 200
    body = response.json()
    assert body['title'] == 'Fractions'
    assert body['content'] == 'Some theory'
    assert body['subject_id'] == subject.id
    assert body['student_lesson_id'] is None
    assert 'quiz_questions' not in body


def test_get_lesson_404s_for_a_private_class(api_client, private_class):
    _, _, lesson = _subject_with_lesson(private_class, 'Private math')

    assert api_client.get(f'/public/lessons/{lesson.id}').status_code == 404


def test_making_a_class_private_again_hides_its_subjects(api_client, public_class):
    subject, _, lesson = _subject_with_lesson(public_class, 'Math')
    assert api_client.get(f'/public/subjects/{subject.id}').status_code == 200

    public_class.is_public = False
    public_class.save()

    assert api_client.get(f'/public/subjects/{subject.id}').status_code == 404
    assert api_client.get(f'/public/lessons/{lesson.id}').status_code == 404
    assert api_client.get('/public/subjects').json() == []


def test_subject_groups_are_readable_without_signing_in(api_client):
    SubjectGroup.objects.all().delete()
    SubjectGroup.objects.create(name='Українська школа', order_index=1)

    response = api_client.get('/academics/subject-groups')

    assert response.status_code == 200
    assert [g['name'] for g in response.json()] == ['Українська школа']


def test_the_authenticated_endpoints_still_require_sign_in(api_client, public_class):
    """Making a class public opens the /public routes only — the regular
    student/tutor endpoints keep 401-ing a visitor, whatever the class flag."""
    subject, topic, lesson = _subject_with_lesson(public_class, 'Math')

    for path in (
        '/academics/my-subjects',
        f'/academics/subjects/{subject.id}',
        f'/academics/subjects/{subject.id}/topics',
        f'/student-lessons/subjects/{subject.id}/lessons',
        f'/student-lessons/lessons/{lesson.id}/preview',
    ):
        assert api_client.get(path).status_code == 401, path


def test_the_tutor_mark_reaches_a_visitor_who_is_not_signed_in(api_client, public_class):
    """The shelf's default view for a visitor shows only what a tutor marked."""
    marked, _, _ = _subject_with_lesson(public_class, 'Marked', order_index=1)
    unmarked, _, _ = _subject_with_lesson(public_class, 'Unmarked', order_index=2)
    Subject.objects.filter(id=marked.id).update(is_marked=True)

    rows = {row['id']: row['is_marked'] for row in api_client.get('/public/subjects').json()}

    assert rows == {marked.id: True, unmarked.id: False}
