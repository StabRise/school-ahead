import datetime

import pytest

from academics.models import Class, School, Subject, Topic
from accounts.models import Role, StudentProfile, TutorProfile, User
from lessons.models import Lesson, LessonType, StudentLesson, StudentLessonStatus
from tutoring.models import TutorSubjectAssignment
from tutoring.services import get_tutor_subject_ids

pytestmark = pytest.mark.django_db


@pytest.fixture
def school_class():
    school = School.objects.create(name='Ahead School')
    return Class.objects.create(school=school, name='5', order_index=5, academic_year='2025/2026')


@pytest.fixture
def subject(school_class):
    return Subject.objects.create(school_class=school_class, name='Math')


@pytest.fixture
def other_subject(school_class):
    return Subject.objects.create(school_class=school_class, name='History')


@pytest.fixture
def tutor():
    user = User.objects.create_user(email='tutor@example.com', role=Role.TUTOR)
    return TutorProfile.objects.create(user=user)


@pytest.fixture
def student(school_class):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user, school_class=school_class)


@pytest.fixture
def other_student(school_class):
    user = User.objects.create_user(email='other-student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user, school_class=school_class)


def _student_lesson_with_status(subject, student, status):
    topic = Topic.objects.create(subject=subject, title='T', order_index=1)
    lesson = Lesson.objects.create(
        topic=topic, order_index=1, title='L', lesson_type=LessonType.WITH_TASK, grading_type='points'
    )
    return StudentLesson.objects.create(
        student=student, lesson=lesson, scheduled_date=datetime.date.today(), status=status
    )


class TestAdminAutoProvisioning:
    def test_new_subject_assigns_existing_admins(self, school_class):
        admin_user = User.objects.create_user(email='admin@example.com', role=Role.ADMIN, is_staff=True)
        subject = Subject.objects.create(school_class=school_class, name='Science')

        assert TutorProfile.objects.filter(user=admin_user).exists()
        assignment = TutorSubjectAssignment.objects.get(subject=subject)
        assert assignment.tutor.user == admin_user

    def test_role_promotion_assigns_all_existing_subjects(self, subject, other_subject):
        from academics.models import Subject

        user = User.objects.create_user(email='promoted@example.com', role=Role.STUDENT)
        assert TutorSubjectAssignment.objects.filter(tutor__user=user).count() == 0

        # Not hardcoding an exact count: the DB also carries the seeded
        # subjects from academics/migrations/0002_seed_initial_data.py.
        total_subjects = Subject.objects.count()

        user.role = Role.ADMIN
        user.is_staff = True
        user.save()

        assert TutorSubjectAssignment.objects.filter(tutor__user=user).count() == total_subjects

    def test_non_admin_save_does_not_assign(self, subject):
        user = User.objects.create_user(email='plain@example.com', role=Role.STUDENT)
        assert not TutorProfile.objects.filter(user=user).exists()


class TestScopeFiltering:
    def test_get_tutor_subject_ids_scoped(self, tutor, subject, other_subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        ids = set(get_tutor_subject_ids(tutor.user))
        assert ids == {subject.id}
        assert other_subject.id not in ids

    def test_need_help_feed_scoped_to_assigned_subjects(
        self, api_client, auth_header, tutor, subject, other_subject, student
    ):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        _student_lesson_with_status(subject, student, StudentLessonStatus.NEED_HELP)
        _student_lesson_with_status(other_subject, student, StudentLessonStatus.NEED_HELP)

        response = api_client.get('/tutor/need-help', headers=auth_header(tutor.user))
        assert response.status_code == 200
        items = response.data['items']
        assert len(items) == 1
        assert items[0]['subject_name'] == 'Math'

    def test_need_help_feed_scoped_to_student(
        self, api_client, auth_header, tutor, subject, student, other_student
    ):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        _student_lesson_with_status(subject, student, StudentLessonStatus.NEED_HELP)
        _student_lesson_with_status(subject, other_student, StudentLessonStatus.NEED_HELP)

        response = api_client.get(
            f'/tutor/need-help?student={student.id}', headers=auth_header(tutor.user)
        )
        assert response.status_code == 200
        items = response.data['items']
        assert len(items) == 1
        assert items[0]['student_name'] == student.user.email


class TestStudentsEndpoint:
    def test_list_students_scoped_to_tutor_classes(self, api_client, auth_header, tutor, subject, student):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        # A student enrolled in an entirely different class — no subject
        # assignment ties the tutor to that class at all.
        other_school = School.objects.create(name='Other School')
        other_class = Class.objects.create(
            school=other_school, name='9', order_index=9, academic_year='2025/2026'
        )
        other_class_user = User.objects.create_user(email='elsewhere@example.com', role=Role.STUDENT)
        StudentProfile.objects.create(user=other_class_user, school_class=other_class)

        response = api_client.get('/tutor/students', headers=auth_header(tutor.user))
        assert response.status_code == 200
        emails = {item['name'] for item in response.data}
        assert student.user.email in emails
        assert other_class_user.email not in emails


class TestGradingDelegation:
    def test_grade_pending_review_via_tutor_endpoint(
        self, api_client, auth_header, tutor, subject, student
    ):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        sl = _student_lesson_with_status(subject, student, StudentLessonStatus.PENDING_REVIEW)

        response = api_client.post(
            f'/tutor/submissions/{sl.id}/grade',
            json={'grade_points': 9, 'feedback': 'Nice work'},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 200

        sl.refresh_from_db()
        assert sl.status == StudentLessonStatus.COMPLETED
        assert sl.grade_points == 9

    def test_grade_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject, student):
        # tutor has no TutorSubjectAssignment for `subject` at all
        sl = _student_lesson_with_status(subject, student, StudentLessonStatus.PENDING_REVIEW)

        response = api_client.post(
            f'/tutor/submissions/{sl.id}/grade',
            json={'grade_points': 9},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 403

    def test_request_revision(self, api_client, auth_header, tutor, subject, student):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        sl = _student_lesson_with_status(subject, student, StudentLessonStatus.PENDING_REVIEW)

        response = api_client.post(
            f'/tutor/submissions/{sl.id}/request-revision',
            json={'feedback': 'missing steps'},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 200
        sl.refresh_from_db()
        assert sl.status == StudentLessonStatus.REVISION_REQUIRED

    def test_resolve_need_help(self, api_client, auth_header, tutor, subject, student):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        sl = _student_lesson_with_status(subject, student, StudentLessonStatus.NEED_HELP)

        response = api_client.post(
            f'/tutor/need-help/{sl.id}/resolve',
            json={'to_status': 'in_progress'},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 200
        sl.refresh_from_db()
        assert sl.status == StudentLessonStatus.IN_PROGRESS

    def test_resolve_need_help_directly_to_completed_with_grade(
        self, api_client, auth_header, tutor, subject, student
    ):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        sl = _student_lesson_with_status(subject, student, StudentLessonStatus.NEED_HELP)

        response = api_client.post(
            f'/tutor/need-help/{sl.id}/resolve',
            json={'to_status': 'completed', 'grade_points': 8, 'feedback': 'Got it eventually'},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 200
        sl.refresh_from_db()
        assert sl.status == StudentLessonStatus.COMPLETED
        assert sl.grade_points == 8
        assert sl.tutor_feedback == 'Got it eventually'

    def test_get_submission_includes_grading_context(self, api_client, auth_header, tutor, subject, student):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        sl = _student_lesson_with_status(subject, student, StudentLessonStatus.NEED_HELP)
        sl.help_note = 'stuck on step 2'
        sl.save(update_fields=['help_note'])

        response = api_client.get(f'/tutor/submissions/{sl.id}', headers=auth_header(tutor.user))
        assert response.status_code == 200
        assert response.data['grading_type'] == 'points'
        assert response.data['help_note'] == 'stuck on step 2'
        assert response.data['subject_name'] == subject.name
        assert response.data['class_name'] == subject.school_class.name


class TestComments:
    def test_tutor_can_post_and_list_comments(self, api_client, auth_header, tutor, subject, student):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        sl = _student_lesson_with_status(subject, student, StudentLessonStatus.IN_PROGRESS)

        post_response = api_client.post(
            f'/tutor/submissions/{sl.id}/comments', json={'body': 'how is it going?'},
            headers=auth_header(tutor.user),
        )
        assert post_response.status_code == 200
        assert post_response.data['kind'] == 'general'

        list_response = api_client.get(
            f'/tutor/submissions/{sl.id}/comments', headers=auth_header(tutor.user)
        )
        assert len(list_response.data) == 1

        sl.refresh_from_db()
        assert sl.status == StudentLessonStatus.IN_PROGRESS

    def test_comments_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject, student):
        sl = _student_lesson_with_status(subject, student, StudentLessonStatus.IN_PROGRESS)

        response = api_client.post(
            f'/tutor/submissions/{sl.id}/comments', json={'body': 'hi'}, headers=auth_header(tutor.user)
        )
        assert response.status_code == 403
