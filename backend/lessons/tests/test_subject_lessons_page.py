"""The preschool subject page loads a subject's lessons a page at a time, per
topic, under the student's lessons filter — and gets its tabs from a small
separate endpoint — instead of fetching the whole subject up front."""

import datetime
import io
from urllib.parse import urlencode

import pytest
from django.core.files.base import ContentFile
from PIL import Image

from academics.models import Class, School, Subject, Topic
from accounts.models import Role, StudentProfile, User
from lessons.models import Lesson, LessonType, StudentLesson, StudentLessonStatus

pytestmark = pytest.mark.django_db


@pytest.fixture
def school_class():
    school = School.objects.create(name='Ahead School')
    return Class.objects.create(school=school, name='1', order_index=1, academic_year='2025/2026', is_public=True)


@pytest.fixture
def subject(school_class):
    return Subject.objects.create(school_class=school_class, name='English')


@pytest.fixture
def topics(subject):
    return [Topic.objects.create(subject=subject, title=f'Topic {n}', order_index=n) for n in (1, 2, 3)]


def _lessons(topic, count, start=1):
    Lesson.objects.bulk_create(
        [
            Lesson(
                topic=topic,
                order_index=index,
                title=f'{topic.title} / {index}',
                lesson_type=LessonType.THEORY,
                grading_type='binary',
            )
            for index in range(start, start + count)
        ]
    )
    return list(Lesson.objects.filter(topic=topic).order_by('order_index'))


@pytest.fixture
def student(school_class):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user, school_class=school_class)


def _assign(student, lesson, status=StudentLessonStatus.ASSIGNED, favorite=False):
    return StudentLesson.objects.create(
        student=student, lesson=lesson, scheduled_date=datetime.date.today(), status=status, is_favorite=favorite
    )


def _url(path, **params):
    return f'{path}?{urlencode(params)}' if params else path


def _page(api_client, headers, subject, topic, **params):
    url = _url(f'/student-lessons/subjects/{subject.id}/lessons-page', topic_id=topic.id, **params)
    return api_client.get(url, headers=headers)


def _tabs(api_client, headers, subject, **params):
    return api_client.get(_url(f'/student-lessons/subjects/{subject.id}/lesson-topics', **params), headers=headers)


@pytest.fixture
def headers(auth_header, student):
    return auth_header(student.user)


def test_a_page_is_ten_lessons_in_order_with_the_total(api_client, headers, student, subject, topics):
    lessons = _lessons(topics[0], 25)
    student.can_do_any_lesson = True
    student.save()

    first = _page(api_client, headers, subject, topics[0]).json()
    second = _page(api_client, headers, subject, topics[0], offset=10).json()
    last = _page(api_client, headers, subject, topics[0], offset=20).json()

    assert (first['count'], second['count'], last['count']) == (25, 25, 25)
    assert [len(p['items']) for p in (first, second, last)] == [10, 10, 5]
    assert [i['id'] for p in (first, second, last) for i in p['items']] == [lesson.id for lesson in lessons]


def test_a_page_only_holds_the_asked_topic(api_client, headers, student, subject, topics):
    _lessons(topics[0], 3)
    other = _lessons(topics[1], 2)
    student.can_do_any_lesson = True
    student.save()

    page = _page(api_client, headers, subject, topics[1]).json()

    assert [i['id'] for i in page['items']] == [lesson.id for lesson in other]


def test_limit_and_offset_are_bounded(api_client, headers, subject, topics):
    assert _page(api_client, headers, subject, topics[0], limit=0).status_code == 422
    assert _page(api_client, headers, subject, topics[0], limit=51).status_code == 422
    assert _page(api_client, headers, subject, topics[0], offset=-1).status_code == 422


def test_available_hides_finished_and_unassigned_lessons(api_client, headers, student, subject, topics):
    open_, done, unassigned = _lessons(topics[0], 3)
    _assign(student, open_)
    _assign(student, done, status=StudentLessonStatus.COMPLETED)

    page = _page(api_client, headers, subject, topics[0]).json()

    assert [i['id'] for i in page['items']] == [open_.id]
    assert page['count'] == 1


def test_available_includes_unassigned_lessons_when_the_student_may_do_any(api_client, headers, student, subject, topics):
    open_, done, unassigned = _lessons(topics[0], 3)
    _assign(student, open_)
    _assign(student, done, status=StudentLessonStatus.COMPLETED)
    student.can_do_any_lesson = True
    student.save()

    page = _page(api_client, headers, subject, topics[0]).json()

    assert [i['id'] for i in page['items']] == [open_.id, unassigned.id]


def test_all_adds_the_finished_ones(api_client, headers, student, subject, topics):
    open_, done, unassigned = _lessons(topics[0], 3)
    _assign(student, open_)
    _assign(student, done, status=StudentLessonStatus.COMPLETED)

    page = _page(api_client, headers, subject, topics[0], filter='all').json()

    assert [i['id'] for i in page['items']] == [open_.id, done.id]  # not the unassigned one


def test_favorites_are_the_hearted_assigned_lessons_finished_or_not(api_client, headers, student, subject, topics):
    plain, hearted, hearted_done, unassigned = _lessons(topics[0], 4)
    _assign(student, plain)
    _assign(student, hearted, favorite=True)
    _assign(student, hearted_done, status=StudentLessonStatus.COMPLETED, favorite=True)
    student.can_do_any_lesson = True
    student.save()

    page = _page(api_client, headers, subject, topics[0], filter='favorites').json()

    assert [i['id'] for i in page['items']] == [hearted.id, hearted_done.id]


def test_an_item_carries_the_students_own_fields(api_client, headers, student, subject, topics):
    (lesson,) = _lessons(topics[0], 1)
    student_lesson = _assign(student, lesson, status=StudentLessonStatus.IN_PROGRESS, favorite=True)

    (item,) = _page(api_client, headers, subject, topics[0]).json()['items']

    assert item['student_lesson_id'] == student_lesson.id
    assert item['status'] == 'in_progress'
    assert item['is_favorite'] is True


def test_the_tabs_are_the_topics_with_lessons_to_show_and_how_many(api_client, headers, student, subject, topics):
    a, b, c = topics
    a1, a2 = _lessons(a, 2)
    (b1,) = _lessons(b, 1)
    (c1,) = _lessons(c, 1)
    _assign(student, a1)
    _assign(student, a2, status=StudentLessonStatus.COMPLETED)
    _assign(student, b1, status=StudentLessonStatus.COMPLETED)
    _assign(student, c1)

    available = _tabs(api_client, headers, subject).json()
    everything = _tabs(api_client, headers, subject, filter='all').json()

    # b has only a finished lesson, so it has no tab under "available".
    assert available == [
        {'id': a.id, 'title': 'Topic 1', 'lesson_count': 1},
        {'id': c.id, 'title': 'Topic 3', 'lesson_count': 1},
    ]
    assert [t['lesson_count'] for t in everything] == [2, 1, 1]


def test_the_tabs_follow_the_topics_order(api_client, headers, student, subject, topics):
    a, b, c = topics
    student.can_do_any_lesson = True
    student.save()
    for topic in topics:
        _lessons(topic, 1)
    Topic.objects.filter(id=a.id).update(order_index=9)

    assert [t['id'] for t in _tabs(api_client, headers, subject).json()] == [b.id, c.id, a.id]


def test_the_work_of_a_request_does_not_grow_with_the_subject(
    api_client, headers, student, subject, topics, django_assert_max_num_queries
):
    _lessons(topics[0], 60)
    student.can_do_any_lesson = True
    student.save()

    with django_assert_max_num_queries(8):
        response = _page(api_client, headers, subject, topics[0], offset=30)
    assert len(response.json()['items']) == 10
    with django_assert_max_num_queries(8):
        _tabs(api_client, headers, subject)


def test_only_the_page_makes_thumbnails(api_client, headers, student, subject, topics, settings, tmp_path):
    """Thumbnails are made the first time an icon's URL is asked for — so a
    request for ten lessons must not make them for the other fifty."""
    settings.MEDIA_ROOT = tmp_path
    lessons = _lessons(topics[0], 30)
    picture = io.BytesIO()
    Image.new('RGB', (900, 700), (10, 120, 200)).save(picture, 'JPEG')
    for lesson in lessons:
        lesson.icon.save(f'{lesson.id}.jpg', ContentFile(picture.getvalue()))
    student.can_do_any_lesson = True
    student.save()

    page = _page(api_client, headers, subject, topics[0]).json()

    assert len(page['items']) == 10
    assert len(list((tmp_path / 'CACHE').rglob('*.jpg'))) == 10


def test_it_is_for_students(api_client, auth_header, subject, topics):
    tutor = User.objects.create_user(email='tutor@example.com', role=Role.TUTOR)
    headers = auth_header(tutor)

    assert _tabs(api_client, headers, subject).status_code == 403
    assert _page(api_client, headers, subject, topics[0]).status_code == 403
    assert _page(api_client, {}, subject, topics[0]).status_code == 401


# --- the same, for a visitor who isn't signed in --------------------------------


def test_a_visitor_gets_the_tabs_and_pages_of_a_public_class(api_client, subject, topics):
    lessons = _lessons(topics[0], 12)
    _lessons(topics[1], 2)

    tabs = api_client.get(f'/public/subjects/{subject.id}/lesson-topics').json()
    page_url = f'/public/subjects/{subject.id}/lessons-page'
    first = api_client.get(_url(page_url, topic_id=topics[0].id)).json()
    second = api_client.get(_url(page_url, topic_id=topics[0].id, offset=10)).json()

    assert [(t['id'], t['lesson_count']) for t in tabs] == [(topics[0].id, 12), (topics[1].id, 2)]
    assert first['count'] == 12
    assert [i['id'] for i in first['items'] + second['items']] == [lesson.id for lesson in lessons]
    # A visitor has no StudentLesson, so nothing about progress comes back.
    assert first['items'][0]['student_lesson_id'] is None


def test_a_visitor_gets_404_for_a_private_class(api_client, subject, topics, school_class):
    Class.objects.filter(id=school_class.id).update(is_public=False)
    _lessons(topics[0], 3)

    assert api_client.get(f'/public/subjects/{subject.id}/lesson-topics').status_code == 404
    response = api_client.get(_url(f'/public/subjects/{subject.id}/lessons-page', topic_id=topics[0].id))
    assert response.status_code == 404
