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
    assert response.data['status'] == 'assigned'
    assert response.data['lesson']['title'] == 'Understanding fractions'


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
