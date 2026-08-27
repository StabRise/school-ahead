import datetime

import pytest

from academics import services as academics_services
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


class TestAssignmentsEndpoint:
    def test_list_assignments_includes_topic_and_lesson_counts(self, api_client, auth_header, tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic_a = Topic.objects.create(subject=subject, title='A', order_index=1)
        topic_b = Topic.objects.create(subject=subject, title='B', order_index=2)
        Lesson.objects.create(
            topic=topic_a, order_index=1, title='L1', lesson_type=LessonType.THEORY, grading_type='points'
        )
        Lesson.objects.create(
            topic=topic_a, order_index=2, title='L2', lesson_type=LessonType.THEORY, grading_type='points'
        )
        Lesson.objects.create(
            topic=topic_b, order_index=1, title='L3', lesson_type=LessonType.THEORY, grading_type='points'
        )

        response = api_client.get('/tutor/assignments', headers=auth_header(tutor.user))
        assert response.status_code == 200
        assert len(response.data) == 1
        assert response.data[0]['topic_count'] == 2
        assert response.data[0]['lesson_count'] == 3

    def test_list_assignments_zero_counts_for_empty_subject(self, api_client, auth_header, tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)

        response = api_client.get('/tutor/assignments', headers=auth_header(tutor.user))
        assert response.status_code == 200
        assert response.data[0]['topic_count'] == 0
        assert response.data[0]['lesson_count'] == 0


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


class TestClassesEndpoint:
    def test_list_classes_scoped_to_tutor_assignments(
        self, api_client, auth_header, tutor, subject, other_subject, student
    ):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        other_school = School.objects.create(name='Other School')
        other_class = Class.objects.create(
            school=other_school, name='9', order_index=9, academic_year='2025/2026'
        )
        # A subject in a different class the tutor is *not* assigned to.
        Subject.objects.create(school_class=other_class, name='Chemistry')

        response = api_client.get('/tutor/classes', headers=auth_header(tutor.user))
        assert response.status_code == 200
        assert len(response.data) == 1
        assert response.data[0]['name'] == subject.school_class.name

    def test_list_classes_reports_class_teacher_and_counts(
        self, api_client, auth_header, tutor, subject, other_subject, student, other_student
    ):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=other_subject)
        school_class = subject.school_class
        school_class.class_teacher = tutor
        school_class.save(update_fields=['class_teacher'])

        response = api_client.get('/tutor/classes', headers=auth_header(tutor.user))
        assert response.status_code == 200
        item = response.data[0]
        assert item['class_teacher_name'] == tutor.user.email
        assert item['is_class_teacher'] is True
        assert item['student_count'] == 2
        assert item['subject_count'] == 2

    def test_list_classes_not_class_teacher_when_someone_else_is(
        self, api_client, auth_header, tutor, subject
    ):
        other_tutor_user = User.objects.create_user(email='other-tutor@example.com', role=Role.TUTOR)
        other_tutor = TutorProfile.objects.create(user=other_tutor_user)
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        subject.school_class.class_teacher = other_tutor
        subject.school_class.save(update_fields=['class_teacher'])

        response = api_client.get('/tutor/classes', headers=auth_header(tutor.user))
        assert response.status_code == 200
        item = response.data[0]
        assert item['class_teacher_name'] == other_tutor_user.email
        assert item['is_class_teacher'] is False

    def test_get_class_detail_includes_roster_and_subjects(
        self, api_client, auth_header, tutor, subject, other_subject, student, other_student
    ):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=other_subject)

        response = api_client.get(
            f'/tutor/classes/{subject.school_class_id}', headers=auth_header(tutor.user)
        )
        assert response.status_code == 200
        assert response.data['name'] == subject.school_class.name
        student_names = {item['name'] for item in response.data['students']}
        assert student_names == {student.user.email, other_student.user.email}
        subject_names = {item['subject_name'] for item in response.data['subjects']}
        assert subject_names == {subject.name, other_subject.name}

    def test_get_class_detail_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject):
        response = api_client.get(
            f'/tutor/classes/{subject.school_class_id}', headers=auth_header(tutor.user)
        )
        assert response.status_code == 403


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


class TestSubjectLessons:
    def test_list_subject_lessons(self, api_client, auth_header, tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='points'
        )

        response = api_client.get(f'/tutor/subjects/{subject.id}/lessons', headers=auth_header(tutor.user))
        assert response.status_code == 200
        assert len(response.data) == 1
        item = response.data[0]
        assert item['title'] == 'Intro'
        assert item['topic_title'] == 'Fractions'
        assert item['subject_name'] == subject.name

    def test_list_subject_lessons_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject):
        Topic.objects.create(subject=subject, title='Fractions', order_index=1)

        response = api_client.get(f'/tutor/subjects/{subject.id}/lessons', headers=auth_header(tutor.user))
        assert response.status_code == 403

    def test_list_subject_lesson_students(self, api_client, auth_header, tutor, subject, student, other_student):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='points'
        )
        other_lesson = Lesson.objects.create(
            topic=topic, order_index=2, title='More', lesson_type=LessonType.THEORY, grading_type='points'
        )
        student_lesson = StudentLesson.objects.create(
            student=student, lesson=lesson, scheduled_date=datetime.date(2026, 1, 10),
            status=StudentLessonStatus.ASSIGNED,
        )
        StudentLesson.objects.create(
            student=other_student, lesson=other_lesson, scheduled_date=datetime.date(2026, 1, 12),
            status=StudentLessonStatus.COMPLETED,
        )

        response = api_client.get(f'/tutor/subjects/{subject.id}/lesson-students', headers=auth_header(tutor.user))
        assert response.status_code == 200
        assert len(response.data) == 2
        by_lesson_id = {row['lesson_id']: row for row in response.data}
        assert by_lesson_id[lesson.id]['student_id'] == student.id
        assert by_lesson_id[lesson.id]['student_lesson_id'] == student_lesson.id
        assert by_lesson_id[other_lesson.id]['status'] == StudentLessonStatus.COMPLETED

    def test_list_subject_lesson_students_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject):
        Topic.objects.create(subject=subject, title='Fractions', order_index=1)

        response = api_client.get(f'/tutor/subjects/{subject.id}/lesson-students', headers=auth_header(tutor.user))
        assert response.status_code == 403


class TestLessonsJsonUpload:
    def _json_file(self, content=b'[]'):
        from django.core.files.uploadedfile import SimpleUploadedFile

        return SimpleUploadedFile('lessons.json', content, content_type='application/json')

    def test_upload_creates_staged_lessons_json(self, api_client, auth_header, tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)

        response = api_client.post(
            f'/tutor/subjects/{subject.id}/lessons-json',
            data={'name': 'Batch 1', 'description': 'Pre-hello songs'},
            FILES={'file': self._json_file()},
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 200
        assert response.data['name'] == 'Batch 1'
        assert response.data['description'] == 'Pre-hello songs\n\nФайл: lessons.json'
        assert response.data['status'] == 'new'
        assert response.data['subject_id'] == subject.id

    def test_upload_appends_original_filename_when_description_is_empty(
        self, api_client, auth_header, tutor, subject
    ):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)

        response = api_client.post(
            f'/tutor/subjects/{subject.id}/lessons-json',
            data={'name': 'Batch 1'},
            FILES={'file': self._json_file()},
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 200
        assert response.data['description'] == 'Файл: lessons.json'

    def test_upload_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject):
        response = api_client.post(
            f'/tutor/subjects/{subject.id}/lessons-json',
            data={'name': 'Batch 1'},
            FILES={'file': self._json_file()},
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 403


class TestLessonDetail:
    def test_get_lesson(self, api_client, auth_header, tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='points'
        )

        response = api_client.get(f'/tutor/lessons/{lesson.id}', headers=auth_header(tutor.user))
        assert response.status_code == 200
        assert response.data['title'] == 'Intro'
        assert response.data['subject_name'] == subject.name
        assert response.data['class_name'] == subject.school_class.name

    def test_get_lesson_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject):
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='points'
        )

        response = api_client.get(f'/tutor/lessons/{lesson.id}', headers=auth_header(tutor.user))
        assert response.status_code == 403

    def test_list_lesson_students(self, api_client, auth_header, tutor, subject, student, other_student):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='points'
        )
        StudentLesson.objects.create(
            student=student, lesson=lesson, scheduled_date=datetime.date(2026, 1, 10),
            status=StudentLessonStatus.ASSIGNED,
        )
        StudentLesson.objects.create(
            student=other_student, lesson=lesson, scheduled_date=datetime.date(2026, 1, 12),
            status=StudentLessonStatus.COMPLETED,
        )

        response = api_client.get(f'/tutor/lessons/{lesson.id}/students', headers=auth_header(tutor.user))
        assert response.status_code == 200
        assert len(response.data) == 2
        assert response.data[0]['scheduled_date'] == '2026-01-10'
        assert response.data[0]['student_name'] == student.user.email
        assert response.data[1]['status'] == StudentLessonStatus.COMPLETED

    def test_list_lesson_students_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject):
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='points'
        )

        response = api_client.get(f'/tutor/lessons/{lesson.id}/students', headers=auth_header(tutor.user))
        assert response.status_code == 403


class TestUpdateLesson:
    def test_update_lesson(self, api_client, auth_header, tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', content='old', lesson_type=LessonType.THEORY,
            grading_type='binary',
        )

        response = api_client.patch(
            f'/tutor/lessons/{lesson.id}',
            json={
                'title': 'Updated title',
                'content': '# New content',
                'task_content': 'Do the thing',
                'lesson_type': 'with_task',
                'grading_type': 'points',
            },
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 200
        assert response.data['title'] == 'Updated title'
        assert response.data['content'] == '# New content'
        assert response.data['task_content'] == 'Do the thing'
        assert response.data['lesson_type'] == 'with_task'
        assert response.data['grading_type'] == 'points'

        lesson.refresh_from_db()
        assert lesson.title == 'Updated title'
        assert lesson.grading_type == 'points'

    def test_update_lesson_rejects_invalid_lesson_type(self, api_client, auth_header, tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='binary'
        )

        response = api_client.patch(
            f'/tutor/lessons/{lesson.id}',
            json={
                'title': 'Intro', 'content': '', 'task_content': '',
                'lesson_type': 'bogus', 'grading_type': 'binary',
            },
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 400

    def test_update_lesson_rejects_invalid_grading_type(self, api_client, auth_header, tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='binary'
        )

        response = api_client.patch(
            f'/tutor/lessons/{lesson.id}',
            json={
                'title': 'Intro', 'content': '', 'task_content': '',
                'lesson_type': 'theory', 'grading_type': 'bogus',
            },
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 400

    def test_update_lesson_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject):
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='binary'
        )

        response = api_client.patch(
            f'/tutor/lessons/{lesson.id}',
            json={
                'title': 'Hacked', 'content': '', 'task_content': '',
                'lesson_type': 'theory', 'grading_type': 'binary',
            },
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 403
        lesson.refresh_from_db()
        assert lesson.title == 'Intro'


class TestAssignStudent:
    def test_list_assignable_students_excludes_already_assigned(
        self, api_client, auth_header, tutor, subject, student, other_student
    ):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='points'
        )
        StudentLesson.objects.create(
            student=student, lesson=lesson, scheduled_date=datetime.date(2026, 1, 10),
        )

        response = api_client.get(
            f'/tutor/lessons/{lesson.id}/assignable-students', headers=auth_header(tutor.user)
        )
        assert response.status_code == 200
        names = {item['name'] for item in response.data}
        assert names == {other_student.user.email}

    def test_assign_lesson_to_student(self, api_client, auth_header, tutor, subject, student):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='points'
        )

        response = api_client.post(
            f'/tutor/lessons/{lesson.id}/assign',
            json={'student_id': student.id, 'scheduled_date': '2026-02-01'},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 200
        assert response.data['student_name'] == student.user.email
        assert response.data['scheduled_date'] == '2026-02-01'
        assert response.data['status'] == StudentLessonStatus.ASSIGNED

        sl = StudentLesson.objects.get(student=student, lesson=lesson)
        assert sl.is_manually_scheduled is True

    def test_assign_lesson_to_already_assigned_student_conflicts(
        self, api_client, auth_header, tutor, subject, student
    ):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='points'
        )
        StudentLesson.objects.create(student=student, lesson=lesson, scheduled_date=datetime.date(2026, 1, 10))

        response = api_client.post(
            f'/tutor/lessons/{lesson.id}/assign',
            json={'student_id': student.id, 'scheduled_date': '2026-02-01'},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 409

    def test_assign_lesson_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject, student):
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='points'
        )

        response = api_client.post(
            f'/tutor/lessons/{lesson.id}/assign',
            json={'student_id': student.id, 'scheduled_date': '2026-02-01'},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 403

    def test_assign_lesson_rejected_for_student_outside_class(
        self, api_client, auth_header, tutor, subject, school_class
    ):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='points'
        )
        other_school = School.objects.create(name='Other School')
        other_class = Class.objects.create(
            school=other_school, name='9', order_index=9, academic_year='2025/2026'
        )
        outside_user = User.objects.create_user(email='outside@example.com', role=Role.STUDENT)
        outside_student = StudentProfile.objects.create(user=outside_user, school_class=other_class)

        response = api_client.post(
            f'/tutor/lessons/{lesson.id}/assign',
            json={'student_id': outside_student.id, 'scheduled_date': '2026-02-01'},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 404


class TestDeleteStudentLesson:
    def test_delete_assigned_student_lesson(self, api_client, auth_header, tutor, subject, student):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='points'
        )
        sl = StudentLesson.objects.create(
            student=student, lesson=lesson, scheduled_date=datetime.date(2026, 1, 10),
            status=StudentLessonStatus.ASSIGNED,
        )

        response = api_client.delete(f'/tutor/student-lessons/{sl.id}', headers=auth_header(tutor.user))

        assert response.status_code == 204
        assert not StudentLesson.objects.filter(id=sl.id).exists()

    def test_delete_rejected_when_not_assigned(self, api_client, auth_header, tutor, subject, student):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='points'
        )
        sl = StudentLesson.objects.create(
            student=student, lesson=lesson, scheduled_date=datetime.date(2026, 1, 10),
            status=StudentLessonStatus.IN_PROGRESS,
        )

        response = api_client.delete(f'/tutor/student-lessons/{sl.id}', headers=auth_header(tutor.user))

        assert response.status_code == 409
        assert StudentLesson.objects.filter(id=sl.id).exists()

    def test_delete_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject, student):
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='points'
        )
        sl = StudentLesson.objects.create(
            student=student, lesson=lesson, scheduled_date=datetime.date(2026, 1, 10),
            status=StudentLessonStatus.ASSIGNED,
        )

        response = api_client.delete(f'/tutor/student-lessons/{sl.id}', headers=auth_header(tutor.user))

        assert response.status_code == 403
        assert StudentLesson.objects.filter(id=sl.id).exists()


class TestSetSubjectFilled:
    def test_set_subject_filled(self, api_client, auth_header, tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        assert subject.is_filled is False

        response = api_client.patch(
            f'/tutor/subjects/{subject.id}/is-filled',
            json={'is_filled': True},
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 200
        assert response.data['is_filled'] is True
        subject.refresh_from_db()
        assert subject.is_filled is True

    def test_unset_subject_filled(self, api_client, auth_header, tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        subject.is_filled = True
        subject.save()

        response = api_client.patch(
            f'/tutor/subjects/{subject.id}/is-filled',
            json={'is_filled': False},
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 200
        assert response.data['is_filled'] is False

    def test_set_subject_filled_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject):
        response = api_client.patch(
            f'/tutor/subjects/{subject.id}/is-filled',
            json={'is_filled': True},
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 403
        subject.refresh_from_db()
        assert subject.is_filled is False


class TestSetTopicBlock:
    def test_set_topic_block(self, api_client, auth_header, tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        subject.block_count = 2
        subject.save()
        academics_services.ensure_subject_blocks(subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        academics_services.assign_topics_to_blocks(subject)
        target_block = subject.blocks.get(index=2)

        response = api_client.patch(
            f'/tutor/topics/{topic.id}/block',
            json={'subject_block_id': target_block.id},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 200
        assert response.data['subject_block_label'] == target_block.label

        topic.refresh_from_db()
        assert topic.subject_block_id == target_block.id
        assert topic.subject_block_manually_set is True

    def test_set_topic_block_survives_later_recompute(self, api_client, auth_header, tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        subject.block_count = 2
        subject.save()
        academics_services.ensure_subject_blocks(subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        academics_services.assign_topics_to_blocks(subject)
        target_block = subject.blocks.get(index=2)

        api_client.patch(
            f'/tutor/topics/{topic.id}/block',
            json={'subject_block_id': target_block.id},
            headers=auth_header(tutor.user),
        )

        Topic.objects.create(subject=subject, title='Another', order_index=2)
        academics_services.assign_topics_to_blocks(subject)

        topic.refresh_from_db()
        assert topic.subject_block_id == target_block.id

    def test_set_topic_block_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject):
        subject.block_count = 2
        subject.save()
        academics_services.ensure_subject_blocks(subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        target_block = subject.blocks.get(index=2)

        response = api_client.patch(
            f'/tutor/topics/{topic.id}/block',
            json={'subject_block_id': target_block.id},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 403

    def test_set_topic_block_rejected_for_block_from_other_subject(
        self, api_client, auth_header, tutor, subject, other_subject
    ):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        subject.block_count = 1
        subject.save()
        academics_services.ensure_subject_blocks(subject)
        other_subject.block_count = 1
        other_subject.save()
        academics_services.ensure_subject_blocks(other_subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        foreign_block = other_subject.blocks.get(index=1)

        response = api_client.patch(
            f'/tutor/topics/{topic.id}/block',
            json={'subject_block_id': foreign_block.id},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 404


class TestReorderTopics:
    def test_reorder_topics(self, api_client, auth_header, tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        t1 = Topic.objects.create(subject=subject, title='Intro', order_index=1)
        t2 = Topic.objects.create(subject=subject, title='Advanced', order_index=2)

        response = api_client.patch(
            f'/tutor/subjects/{subject.id}/topics/reorder',
            json={'items': [{'id': t1.id, 'order_index': 2}, {'id': t2.id, 'order_index': 1}]},
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 200
        t1.refresh_from_db()
        t2.refresh_from_db()
        assert t1.order_index == 2
        assert t2.order_index == 1

    def test_reorder_topics_moves_topic_across_auto_assigned_blocks(
        self, api_client, auth_header, tutor, subject
    ):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        subject.block_count = 2
        subject.save()
        academics_services.ensure_subject_blocks(subject)
        t1 = Topic.objects.create(subject=subject, title='T1', order_index=1)
        t2 = Topic.objects.create(subject=subject, title='T2', order_index=2)
        academics_services.assign_topics_to_blocks(subject)
        first_block = subject.blocks.get(index=1)
        second_block = subject.blocks.get(index=2)
        t1.refresh_from_db()
        t2.refresh_from_db()
        assert t1.subject_block_id == first_block.id
        assert t2.subject_block_id == second_block.id

        api_client.patch(
            f'/tutor/subjects/{subject.id}/topics/reorder',
            json={'items': [{'id': t1.id, 'order_index': 2}, {'id': t2.id, 'order_index': 1}]},
            headers=auth_header(tutor.user),
        )

        t1.refresh_from_db()
        t2.refresh_from_db()
        assert t2.subject_block_id == first_block.id
        assert t1.subject_block_id == second_block.id

    def test_reorder_topics_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject):
        t1 = Topic.objects.create(subject=subject, title='Intro', order_index=1)

        response = api_client.patch(
            f'/tutor/subjects/{subject.id}/topics/reorder',
            json={'items': [{'id': t1.id, 'order_index': 1}]},
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 403

    def test_reorder_topics_rejected_for_topic_from_other_subject(
        self, api_client, auth_header, tutor, subject, other_subject
    ):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        foreign_topic = Topic.objects.create(subject=other_subject, title='Foreign', order_index=1)

        response = api_client.patch(
            f'/tutor/subjects/{subject.id}/topics/reorder',
            json={'items': [{'id': foreign_topic.id, 'order_index': 1}]},
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 404


class TestDeleteTopic:
    def test_delete_topic_deletes_its_lessons(self, api_client, auth_header, tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='binary'
        )

        response = api_client.delete(f'/tutor/topics/{topic.id}', headers=auth_header(tutor.user))

        assert response.status_code == 204
        assert not Topic.objects.filter(id=topic.id).exists()
        assert not Lesson.objects.filter(id=lesson.id).exists()

    def test_delete_topic_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject):
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)

        response = api_client.delete(f'/tutor/topics/{topic.id}', headers=auth_header(tutor.user))

        assert response.status_code == 403
        assert Topic.objects.filter(id=topic.id).exists()


class TestDeleteLesson:
    def test_delete_lesson(self, api_client, auth_header, tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='binary'
        )

        response = api_client.delete(f'/tutor/lessons/{lesson.id}', headers=auth_header(tutor.user))

        assert response.status_code == 204
        assert not Lesson.objects.filter(id=lesson.id).exists()
        assert Topic.objects.filter(id=topic.id).exists()

    def test_delete_lesson_rejected_for_unassigned_tutor(self, api_client, auth_header, tutor, subject):
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='binary'
        )

        response = api_client.delete(f'/tutor/lessons/{lesson.id}', headers=auth_header(tutor.user))

        assert response.status_code == 403
        assert Lesson.objects.filter(id=lesson.id).exists()

    def test_delete_lesson_rejected_when_assigned_to_student(self, api_client, auth_header, tutor, subject, student):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
        lesson = Lesson.objects.create(
            topic=topic, order_index=1, title='Intro', lesson_type=LessonType.THEORY, grading_type='binary'
        )
        StudentLesson.objects.create(
            student=student, lesson=lesson, scheduled_date=datetime.date.today(), status=StudentLessonStatus.ASSIGNED
        )

        response = api_client.delete(f'/tutor/lessons/{lesson.id}', headers=auth_header(tutor.user))

        assert response.status_code == 409
        assert Lesson.objects.filter(id=lesson.id).exists()
