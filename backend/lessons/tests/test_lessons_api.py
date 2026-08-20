import datetime

import pytest

from academics.models import Class, School, Subject, Topic
from accounts.models import Role, StudentProfile, User
from lessons.models import Lesson, LessonType, StudentLesson

pytestmark = pytest.mark.django_db


@pytest.fixture
def topic():
    school = School.objects.create(name='Ahead School')
    school_class = Class.objects.create(school=school, name='5', order_index=5, academic_year='2025/2026')
    subject = Subject.objects.create(school_class=school_class, name='Math')
    return Topic.objects.create(subject=subject, title='Fractions', order_index=1)


@pytest.fixture
def student():
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user)


@pytest.fixture
def other_student():
    user = User.objects.create_user(email='other@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user)


@pytest.fixture
def student_lesson(topic, student):
    lesson = Lesson.objects.create(
        topic=topic, order_index=1, title='Understanding fractions',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )
    return StudentLesson.objects.create(
        student=student, lesson=lesson, scheduled_date=datetime.date.today()
    )


def test_get_lesson_as_owner(api_client, auth_header, student, student_lesson):
    response = api_client.get(
        f'/student-lessons/{student_lesson.id}', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    # GET auto-transitions Assigned -> InProgress on access (spec 2.1).
    assert response.data['status'] == 'in_progress'
    assert response.data['lesson']['title'] == 'Understanding fractions'


def test_get_lesson_exposes_submissions_with_threaded_feedback(api_client, auth_header, topic, student):
    from lessons import services

    lesson = Lesson.objects.create(
        topic=topic, order_index=2, title='Practical work',
        lesson_type=LessonType.WITH_TASK, grading_type='points',
    )
    sl = StudentLesson.objects.create(
        student=student, lesson=lesson, scheduled_date=datetime.date.today()
    )
    services.start(sl, student.user)
    services.submit_task(sl, student.user, comment='v1')
    services.request_revision(sl, student.user, feedback='fix the second step')
    services.resubmit(sl, student.user, comment='v2')

    response = api_client.get(f'/student-lessons/{sl.id}', headers=auth_header(student.user))
    assert response.status_code == 200
    submissions = response.data['submissions']
    assert [s['comment'] for s in submissions] == ['v1', 'v2']  # oldest first
    assert submissions[0]['tutor_feedback'] == 'fix the second step'
    assert submissions[0]['feedback_at'] is not None
    assert submissions[1]['tutor_feedback'] == ''


def test_get_lesson_does_not_re_transition_once_progressed(
    api_client, auth_header, student, student_lesson
):
    headers = auth_header(student.user)
    api_client.get(f'/student-lessons/{student_lesson.id}', headers=headers)

    api_client.post(
        f'/student-lessons/{student_lesson.id}/request-help', json={'note': 'stuck'}, headers=headers
    )
    response = api_client.get(f'/student-lessons/{student_lesson.id}', headers=headers)
    assert response.data['status'] == 'need_help'


def test_get_lesson_rejects_non_owner(api_client, auth_header, other_student, student_lesson):
    response = api_client.get(
        f'/student-lessons/{student_lesson.id}', headers=auth_header(other_student.user)
    )
    assert response.status_code == 403


def test_start_and_confirm_understanding_flow(api_client, auth_header, student, student_lesson):
    headers = auth_header(student.user)

    start_response = api_client.post(f'/student-lessons/{student_lesson.id}/start', headers=headers)
    assert start_response.status_code == 200
    assert start_response.data['status'] == 'in_progress'

    confirm_response = api_client.post(
        f'/student-lessons/{student_lesson.id}/confirm-understanding',
        json={'understood': True},
        headers=headers,
    )
    assert confirm_response.status_code == 200
    assert confirm_response.data['status'] == 'completed'
    assert confirm_response.data['grade_result'] == 'pass'


def test_invalid_transition_returns_409(api_client, auth_header, student, student_lesson):
    headers = auth_header(student.user)
    # Lesson is still "assigned" — confirm-understanding requires in_progress.
    response = api_client.post(
        f'/student-lessons/{student_lesson.id}/confirm-understanding',
        json={'understood': True},
        headers=headers,
    )
    assert response.status_code == 409


def test_request_help_sets_note(api_client, auth_header, student, student_lesson):
    headers = auth_header(student.user)
    api_client.post(f'/student-lessons/{student_lesson.id}/start', headers=headers)

    response = api_client.post(
        f'/student-lessons/{student_lesson.id}/request-help',
        json={'note': 'confused about denominators'},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.data['status'] == 'need_help'
    assert response.data['help_note'] == 'confused about denominators'


def test_add_and_list_comments(api_client, auth_header, student, student_lesson):
    headers = auth_header(student.user)
    api_client.get(f'/student-lessons/{student_lesson.id}', headers=headers)

    post_response = api_client.post(
        f'/student-lessons/{student_lesson.id}/comments', json={'body': 'hello'}, headers=headers
    )
    assert post_response.status_code == 200
    assert post_response.data['kind'] == 'general'
    assert post_response.data['author_name'] == (student.user.full_name or student.user.email)

    list_response = api_client.get(f'/student-lessons/{student_lesson.id}/comments', headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.data) == 1

    # posting a general comment never changes status
    lesson_response = api_client.get(f'/student-lessons/{student_lesson.id}', headers=headers)
    assert lesson_response.data['status'] == 'in_progress'


def test_resolve_own_need_help(api_client, auth_header, student, student_lesson):
    headers = auth_header(student.user)
    api_client.post(f'/student-lessons/{student_lesson.id}/start', headers=headers)
    api_client.post(
        f'/student-lessons/{student_lesson.id}/request-help', json={'note': 'stuck'}, headers=headers
    )

    response = api_client.post(
        f'/student-lessons/{student_lesson.id}/resolve-need-help', headers=headers
    )
    assert response.status_code == 200
    assert response.data['status'] == 'in_progress'

    comments = api_client.get(f'/student-lessons/{student_lesson.id}/comments', headers=headers)
    help_comment = next(c for c in comments.data if c['kind'] == 'help_request')
    assert help_comment['is_resolved'] is True


def test_resolve_own_need_help_rejects_wrong_status(api_client, auth_header, student, student_lesson):
    headers = auth_header(student.user)
    response = api_client.post(
        f'/student-lessons/{student_lesson.id}/resolve-need-help', headers=headers
    )
    assert response.status_code == 409
