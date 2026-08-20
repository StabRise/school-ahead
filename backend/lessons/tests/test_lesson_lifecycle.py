import datetime

import pytest

from academics.models import Class, School, Subject, Topic
from accounts.models import Role, StudentProfile, User
from lessons import services
from lessons.models import (
    GradeResult,
    Lesson,
    LessonType,
    QuizChoice,
    QuizQuestion,
    StudentLesson,
    StudentLessonStatus,
)

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
def tutor_user():
    return User.objects.create_user(email='tutor@example.com', role=Role.TUTOR)


def _new_student_lesson(topic, lesson_type, student, grading_type='points'):
    lesson = Lesson.objects.create(
        topic=topic, order_index=1, title='Lesson', lesson_type=lesson_type, grading_type=grading_type
    )
    return StudentLesson.objects.create(
        student=student, lesson=lesson, scheduled_date=datetime.date.today()
    )


class TestQuizPath:
    def test_pass_completes(self, topic, student):
        sl = _new_student_lesson(topic, LessonType.WITH_QUIZ, student)
        q = QuizQuestion.objects.create(lesson=sl.lesson, prompt='2+2?')
        correct = QuizChoice.objects.create(question=q, text='4', is_correct=True)
        QuizChoice.objects.create(question=q, text='5', is_correct=False)

        services.start(sl, student.user)
        assert sl.status == StudentLessonStatus.IN_PROGRESS

        score = services.submit_quiz(sl, student.user, {q.id: correct.id})
        assert score == 100
        assert sl.status == StudentLessonStatus.COMPLETED
        assert sl.grade_points is not None
        assert sl.completed_at is not None

    def test_fail_stays_in_progress_and_can_retake(self, topic, student):
        sl = _new_student_lesson(topic, LessonType.WITH_QUIZ, student)
        q = QuizQuestion.objects.create(lesson=sl.lesson, prompt='2+2?')
        correct = QuizChoice.objects.create(question=q, text='4', is_correct=True)
        wrong = QuizChoice.objects.create(question=q, text='5', is_correct=False)

        services.start(sl, student.user)
        score = services.submit_quiz(sl, student.user, {q.id: wrong.id})
        assert score == 0
        assert sl.status == StudentLessonStatus.IN_PROGRESS
        assert sl.attempt_count == 1

        # retake
        score = services.submit_quiz(sl, student.user, {q.id: correct.id})
        assert score == 100
        assert sl.status == StudentLessonStatus.COMPLETED
        assert sl.attempt_count == 2

    def test_fail_can_request_help_instead(self, topic, student):
        sl = _new_student_lesson(topic, LessonType.WITH_QUIZ, student)
        q = QuizQuestion.objects.create(lesson=sl.lesson, prompt='2+2?')
        QuizChoice.objects.create(question=q, text='4', is_correct=True)
        wrong = QuizChoice.objects.create(question=q, text='5', is_correct=False)

        services.start(sl, student.user)
        services.submit_quiz(sl, student.user, {q.id: wrong.id})
        services.request_help(sl, student.user, note='stuck')
        assert sl.status == StudentLessonStatus.NEED_HELP
        assert sl.help_note == 'stuck'


class TestTheoryPath:
    def test_understood_completes_with_pass(self, topic, student):
        sl = _new_student_lesson(topic, LessonType.THEORY, student, grading_type='binary')
        services.start(sl, student.user)
        services.confirm_understanding(sl, student.user, True)
        assert sl.status == StudentLessonStatus.COMPLETED
        assert sl.grade_result == GradeResult.PASS

    def test_not_understood_goes_to_need_help(self, topic, student):
        sl = _new_student_lesson(topic, LessonType.THEORY, student, grading_type='binary')
        services.start(sl, student.user)
        services.confirm_understanding(sl, student.user, False)
        assert sl.status == StudentLessonStatus.NEED_HELP

    def test_need_help_resolved_to_in_progress_by_tutor(self, topic, student, tutor_user):
        sl = _new_student_lesson(topic, LessonType.THEORY, student, grading_type='binary')
        services.start(sl, student.user)
        services.confirm_understanding(sl, student.user, False)

        services.resolve_need_help(sl, tutor_user, to_status=StudentLessonStatus.IN_PROGRESS)
        assert sl.status == StudentLessonStatus.IN_PROGRESS

        services.confirm_understanding(sl, student.user, True)
        assert sl.status == StudentLessonStatus.COMPLETED


class TestTaskPath:
    def test_submit_locks_for_review(self, topic, student):
        sl = _new_student_lesson(topic, LessonType.WITH_TASK, student)
        services.start(sl, student.user)
        services.submit_task(sl, student.user, comment='done')
        assert sl.status == StudentLessonStatus.PENDING_REVIEW
        assert sl.submissions.count() == 1

    def test_cannot_start_again_while_pending_review(self, topic, student):
        sl = _new_student_lesson(topic, LessonType.WITH_TASK, student)
        services.start(sl, student.user)
        services.submit_task(sl, student.user)
        with pytest.raises(services.InvalidTransition):
            services.start(sl, student.user)

    def test_tutor_grades_to_completed(self, topic, student, tutor_user):
        sl = _new_student_lesson(topic, LessonType.WITH_TASK, student)
        services.start(sl, student.user)
        services.submit_task(sl, student.user)

        services.grade_submission(sl, tutor_user, grade_points=10, feedback='Great job')
        assert sl.status == StudentLessonStatus.COMPLETED
        assert sl.grade_points == 10
        assert sl.tutor_feedback == 'Great job'

    def test_tutor_requests_revision_then_resubmit_then_grade(self, topic, student, tutor_user):
        sl = _new_student_lesson(topic, LessonType.WITH_TASK, student)
        services.start(sl, student.user)
        first_submission = services.submit_task(sl, student.user, comment='v1')

        services.request_revision(sl, tutor_user, feedback='fix this')
        assert sl.status == StudentLessonStatus.REVISION_REQUIRED

        second_submission = services.resubmit(sl, student.user, comment='v2')
        assert sl.status == StudentLessonStatus.PENDING_REVIEW

        first_submission.refresh_from_db()
        assert first_submission.is_latest is False
        assert second_submission.is_latest is True

        services.grade_submission(sl, tutor_user, grade_points=8)
        assert sl.status == StudentLessonStatus.COMPLETED


class TestAuditLog:
    def test_status_events_recorded(self, topic, student):
        sl = _new_student_lesson(topic, LessonType.THEORY, student, grading_type='binary')
        services.start(sl, student.user)
        services.confirm_understanding(sl, student.user, True)

        events = list(sl.status_events.order_by('created_at'))
        assert [e.to_status for e in events] == [
            StudentLessonStatus.IN_PROGRESS,
            StudentLessonStatus.COMPLETED,
        ]
        assert events[0].actor == student.user


class TestReschedule:
    def test_manual_reschedule_sets_flag(self, topic, student):
        sl = _new_student_lesson(topic, LessonType.THEORY, student, grading_type='binary')
        new_date = datetime.date.today() + datetime.timedelta(days=7)
        services.reschedule(sl, new_date)
        assert sl.scheduled_date == new_date
        assert sl.is_manually_scheduled is True

    def test_cannot_reschedule_completed_lesson(self, topic, student):
        sl = _new_student_lesson(topic, LessonType.THEORY, student, grading_type='binary')
        services.start(sl, student.user)
        services.confirm_understanding(sl, student.user, True)
        with pytest.raises(services.InvalidTransition):
            services.reschedule(sl, datetime.date.today())


class TestSyncScheduledLesson:
    def test_creates_new_row(self, topic, student):
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='L', lesson_type=LessonType.THEORY, grading_type='binary'
        )
        date = datetime.date.today()
        sl = services.sync_scheduled_lesson(student, lesson, date)
        assert sl.scheduled_date == date

    def test_skips_completed_row(self, topic, student):
        sl = _new_student_lesson(topic, LessonType.THEORY, student, grading_type='binary')
        services.start(sl, student.user)
        services.confirm_understanding(sl, student.user, True)
        original_date = sl.scheduled_date

        new_date = original_date + datetime.timedelta(days=14)
        result = services.sync_scheduled_lesson(student, sl.lesson, new_date)
        assert result.scheduled_date == original_date

    def test_skips_manually_scheduled_row(self, topic, student):
        sl = _new_student_lesson(topic, LessonType.THEORY, student, grading_type='binary')
        manual_date = datetime.date.today() + datetime.timedelta(days=3)
        services.reschedule(sl, manual_date)

        result = services.sync_scheduled_lesson(
            student, sl.lesson, datetime.date.today() + datetime.timedelta(days=30)
        )
        assert result.scheduled_date == manual_date
