import datetime

import pytest

from academics.models import Class, School, Subject, Topic
from accounts.models import Role, StudentProfile, User
from lessons.models import Lesson, LessonComment, LessonSubmission, LessonType, StudentLesson

pytestmark = pytest.mark.django_db


@pytest.fixture
def school_class():
    school = School.objects.create(name='Ahead School')
    return Class.objects.create(school=school, name='5', order_index=5, academic_year='2025/2026')


@pytest.fixture
def lesson(school_class):
    subject = Subject.objects.create(school_class=school_class, name='Math')
    topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
    return Lesson.objects.create(
        topic=topic, order_index=1, title='Understanding fractions',
        content='Some theory content', lesson_type=LessonType.THEORY, grading_type='binary',
    )


@pytest.fixture
def student(school_class):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user, school_class=school_class, can_do_any_lesson=True)


@pytest.fixture
def restricted_student(school_class):
    user = User.objects.create_user(email='restricted@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user, school_class=school_class, can_do_any_lesson=False)


@pytest.fixture
def other_class_student():
    school = School.objects.create(name='Other School')
    other_class = Class.objects.create(school=school, name='6', order_index=6, academic_year='2025/2026')
    user = User.objects.create_user(email='outsider@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user, school_class=other_class, can_do_any_lesson=True)


class TestPreviewLesson:
    def test_preview_allowed_with_can_do_any_lesson(self, api_client, auth_header, student, lesson):
        response = api_client.get(f'/student-lessons/lessons/{lesson.id}/preview', headers=auth_header(student.user))

        assert response.status_code == 200
        assert response.data['title'] == 'Understanding fractions'
        assert response.data['content'] == 'Some theory content'
        assert response.data['subject_name'] == 'Math'
        assert response.data['topic_title'] == 'Fractions'
        assert response.data['student_lesson_id'] is None

    def test_preview_rejected_without_flag(self, api_client, auth_header, restricted_student, lesson):
        response = api_client.get(
            f'/student-lessons/lessons/{lesson.id}/preview', headers=auth_header(restricted_student.user)
        )

        assert response.status_code == 403

    def test_preview_allowed_without_flag_when_already_assigned(
        self, api_client, auth_header, restricted_student, lesson
    ):
        student_lesson = StudentLesson.objects.create(
            student=restricted_student, lesson=lesson, scheduled_date=datetime.date.today()
        )

        response = api_client.get(
            f'/student-lessons/lessons/{lesson.id}/preview', headers=auth_header(restricted_student.user)
        )

        assert response.status_code == 200
        assert response.data['student_lesson_id'] == student_lesson.id

    def test_preview_rejected_for_student_in_another_class(self, api_client, auth_header, other_class_student, lesson):
        response = api_client.get(
            f'/student-lessons/lessons/{lesson.id}/preview', headers=auth_header(other_class_student.user)
        )

        assert response.status_code == 404


class TestStartLessonToday:
    def test_start_creates_student_lesson_for_today(self, api_client, auth_header, student, lesson):
        response = api_client.post(
            f'/student-lessons/lessons/{lesson.id}/start-today', headers=auth_header(student.user)
        )

        assert response.status_code == 200
        student_lesson = StudentLesson.objects.get(id=response.data['student_lesson_id'])
        assert student_lesson.student_id == student.id
        assert student_lesson.lesson_id == lesson.id
        assert student_lesson.scheduled_date == datetime.date.today()
        assert student_lesson.is_manually_scheduled is True
        assert student_lesson.is_self_selected is True

    def test_start_rejected_without_flag(self, api_client, auth_header, restricted_student, lesson):
        response = api_client.post(
            f'/student-lessons/lessons/{lesson.id}/start-today', headers=auth_header(restricted_student.user)
        )

        assert response.status_code == 403
        assert not StudentLesson.objects.filter(student=restricted_student, lesson=lesson).exists()

    def test_start_is_idempotent_when_already_started(self, api_client, auth_header, student, lesson):
        first = api_client.post(
            f'/student-lessons/lessons/{lesson.id}/start-today', headers=auth_header(student.user)
        )
        second = api_client.post(
            f'/student-lessons/lessons/{lesson.id}/start-today', headers=auth_header(student.user)
        )

        assert first.status_code == 200
        assert second.status_code == 200
        assert first.data['student_lesson_id'] == second.data['student_lesson_id']
        assert StudentLesson.objects.filter(student=student, lesson=lesson).count() == 1


class TestCancelSelfSelectedLesson:
    def test_cancel_deletes_untouched_self_selected_lesson(self, api_client, auth_header, student, lesson):
        student_lesson = StudentLesson.objects.create(
            student=student, lesson=lesson, scheduled_date=datetime.date.today(),
            is_manually_scheduled=True, is_self_selected=True,
        )

        response = api_client.delete(f'/student-lessons/{student_lesson.id}', headers=auth_header(student.user))

        assert response.status_code == 204
        assert not StudentLesson.objects.filter(id=student_lesson.id).exists()

    def test_cancel_rejected_for_tutor_assigned_lesson(self, api_client, auth_header, student, lesson):
        student_lesson = StudentLesson.objects.create(
            student=student, lesson=lesson, scheduled_date=datetime.date.today(),
            is_manually_scheduled=True, is_self_selected=False,
        )

        response = api_client.delete(f'/student-lessons/{student_lesson.id}', headers=auth_header(student.user))

        assert response.status_code == 409
        assert StudentLesson.objects.filter(id=student_lesson.id).exists()

    def test_cancel_rejected_when_submission_exists(self, api_client, auth_header, student, lesson):
        student_lesson = StudentLesson.objects.create(
            student=student, lesson=lesson, scheduled_date=datetime.date.today(),
            is_manually_scheduled=True, is_self_selected=True,
        )
        LessonSubmission.objects.create(student_lesson=student_lesson)

        response = api_client.delete(f'/student-lessons/{student_lesson.id}', headers=auth_header(student.user))

        assert response.status_code == 409
        assert StudentLesson.objects.filter(id=student_lesson.id).exists()

    def test_cancel_rejected_when_comment_exists(self, api_client, auth_header, student, lesson):
        student_lesson = StudentLesson.objects.create(
            student=student, lesson=lesson, scheduled_date=datetime.date.today(),
            is_manually_scheduled=True, is_self_selected=True,
        )
        LessonComment.objects.create(student_lesson=student_lesson, author=student.user, body='A question')

        response = api_client.delete(f'/student-lessons/{student_lesson.id}', headers=auth_header(student.user))

        assert response.status_code == 409
        assert StudentLesson.objects.filter(id=student_lesson.id).exists()

    def test_cancel_rejected_for_non_owner(self, api_client, auth_header, student, restricted_student, lesson):
        student_lesson = StudentLesson.objects.create(
            student=student, lesson=lesson, scheduled_date=datetime.date.today(),
            is_manually_scheduled=True, is_self_selected=True,
        )

        response = api_client.delete(
            f'/student-lessons/{student_lesson.id}', headers=auth_header(restricted_student.user)
        )

        assert response.status_code == 403
        assert StudentLesson.objects.filter(id=student_lesson.id).exists()
