import datetime

import pytest

from academics.models import Class, School, Subject, Topic
from accounts.models import Role, StudentProfile, TutorProfile, User
from lessons import services as lesson_services
from lessons.models import Lesson, LessonType, StudentLesson, StudentLessonStatus
from scheduling import services
from tutoring.models import TutorSubjectAssignment

pytestmark = pytest.mark.django_db


@pytest.fixture
def school_class():
    school = School.objects.create(name='Ahead School')
    return Class.objects.create(school=school, name='5', order_index=5, academic_year='2025/2026')


@pytest.fixture
def subject(school_class):
    return Subject.objects.create(
        school_class=school_class,
        name='Math',
        start_date=datetime.date(2025, 9, 1),
        due_date=datetime.date(2025, 9, 22),
    )


@pytest.fixture
def student(school_class):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user, school_class=school_class)


@pytest.fixture
def tutor():
    user = User.objects.create_user(email='tutor@example.com', role=Role.TUTOR)
    return TutorProfile.objects.create(user=user)


def _make_lessons(subject, count):
    topic = Topic.objects.create(subject=subject, title='T', order_index=1)
    return [
        Lesson.objects.create(
            topic=topic, order_index=i, title=f'Lesson {i}',
            lesson_type=LessonType.THEORY, grading_type='binary',
        )
        for i in range(1, count + 1)
    ]


class TestGenerateCalendar:
    def test_distributes_lessons_across_weeks_for_enrolled_students(self, subject, student):
        _make_lessons(subject, 6)  # 4 weeks in [2025-09-01, 2025-09-22]

        result = services.generate_calendar_for_subject(subject)

        assert result['students_affected'] == 1
        assert StudentLesson.objects.filter(student=student).count() == 6
        # every scheduled_date falls within the subject's date range's weeks
        for sl in StudentLesson.objects.filter(student=student):
            assert sl.scheduled_date >= subject.start_date

    def test_ignores_students_outside_the_class(self, subject, school_class):
        _make_lessons(subject, 2)
        other_class = Class.objects.create(
            school=school_class.school, name='6', order_index=6, academic_year='2025/2026'
        )
        outside_user = User.objects.create_user(email='outside@example.com', role=Role.STUDENT)
        StudentProfile.objects.create(user=outside_user, school_class=other_class)

        services.generate_calendar_for_subject(subject)
        assert StudentLesson.objects.filter(student__user=outside_user).count() == 0

    def test_recalculate_skips_completed_and_manual_rows(self, subject, student):
        lessons = _make_lessons(subject, 2)
        services.generate_calendar_for_subject(subject)

        completed_sl = StudentLesson.objects.get(student=student, lesson=lessons[0])
        lesson_services.start(completed_sl, student.user)
        lesson_services.confirm_understanding(completed_sl, student.user, True)
        completed_original_date = completed_sl.scheduled_date

        manual_sl = StudentLesson.objects.get(student=student, lesson=lessons[1])
        manual_date = datetime.date(2025, 9, 10)
        lesson_services.reschedule(manual_sl, manual_date)

        # Change the subject's window and recalculate.
        subject.due_date = datetime.date(2025, 10, 6)
        subject.save()
        services.generate_calendar_for_subject(subject)

        completed_sl.refresh_from_db()
        manual_sl.refresh_from_db()
        assert completed_sl.scheduled_date == completed_original_date
        assert manual_sl.scheduled_date == manual_date
        assert manual_sl.is_manually_scheduled is True


class TestGenerateClassSchedule:
    def test_schedules_only_new_lessons_across_school_days(self, subject, school_class, student):
        _make_lessons(subject, 2)
        # A Monday..Friday week (2025-09-01 is a Monday, per the backlog-label test above).
        start = datetime.date(2025, 9, 1)
        end = datetime.date(2025, 9, 5)

        result = services.generate_class_schedule(school_class, start, end, {subject.id: 2})

        assert result['lessons_scheduled'] == 2
        assert result['subjects'] == [{'subject_id': subject.id, 'lessons_scheduled': 2}]
        dates = set(StudentLesson.objects.filter(student=student).values_list('scheduled_date', flat=True))
        assert len(dates) == 2  # spread across two different days, not doubled up
        assert dates <= {start + datetime.timedelta(days=i) for i in range(5)}

    def test_zero_hours_per_week_skips_subject(self, subject, school_class, student):
        _make_lessons(subject, 3)
        result = services.generate_class_schedule(
            school_class, datetime.date(2025, 9, 1), datetime.date(2025, 9, 5), {subject.id: 0}
        )
        assert result == {'lessons_scheduled': 0, 'students_affected': 1, 'subjects': []}
        assert StudentLesson.objects.count() == 0

    def test_never_touches_an_already_scheduled_lesson(self, subject, school_class, student):
        lessons = _make_lessons(subject, 2)
        pinned_date = datetime.date(2025, 9, 3)
        existing = StudentLesson.objects.create(student=student, lesson=lessons[0], scheduled_date=pinned_date)

        services.generate_class_schedule(
            school_class, datetime.date(2025, 9, 1), datetime.date(2025, 9, 5), {subject.id: 2}
        )

        existing.refresh_from_db()
        assert existing.scheduled_date == pinned_date  # untouched
        # Only the second (never-scheduled) lesson was newly planned.
        assert StudentLesson.objects.filter(student=student, lesson=lessons[1]).exists()

    def test_avoids_days_already_loaded_by_another_subject(self, subject, school_class, student):
        other_subject = Subject.objects.create(school_class=school_class, name='History')
        other_lessons = _make_lessons(other_subject, 2)
        monday = datetime.date(2025, 9, 1)
        tuesday = datetime.date(2025, 9, 2)
        StudentLesson.objects.create(student=student, lesson=other_lessons[0], scheduled_date=monday)
        StudentLesson.objects.create(student=student, lesson=other_lessons[1], scheduled_date=monday)
        StudentLesson.objects.create(
            student=student,
            lesson=Lesson.objects.create(
                topic=other_lessons[0].topic, order_index=3, title='L3',
                lesson_type=LessonType.THEORY, grading_type='binary',
            ),
            scheduled_date=tuesday,
        )

        _make_lessons(subject, 1)
        services.generate_class_schedule(school_class, monday, datetime.date(2025, 9, 5), {subject.id: 1})

        new_sl = StudentLesson.objects.get(student=student, lesson__topic__subject=subject)
        # Monday already has 2, Tuesday already has 1 — Wednesday is the
        # first untouched day.
        assert new_sl.scheduled_date == datetime.date(2025, 9, 3)

    def test_repeats_a_subject_on_the_same_day_once_every_day_is_taken(self, subject, school_class, student):
        _make_lessons(subject, 4)
        # Only two school days in range (Mon-Tue) but a target of 4 lessons
        # (hours_per_week=10 * 2/5 week fraction = 4) — each day must take
        # two, since there's nowhere else to put them.
        monday = datetime.date(2025, 9, 1)
        tuesday = datetime.date(2025, 9, 2)
        result = services.generate_class_schedule(school_class, monday, tuesday, {subject.id: 10})
        assert result['subjects'] == [{'subject_id': subject.id, 'lessons_scheduled': 4}]
        assert StudentLesson.objects.filter(student=student, scheduled_date=monday).count() == 2
        assert StudentLesson.objects.filter(student=student, scheduled_date=tuesday).count() == 2

    def test_no_school_days_in_range_is_a_noop(self, subject, school_class, student):
        _make_lessons(subject, 1)
        saturday = datetime.date(2025, 9, 6)
        sunday = datetime.date(2025, 9, 7)
        result = services.generate_class_schedule(school_class, saturday, sunday, {subject.id: 5})
        assert result == {'lessons_scheduled': 0, 'students_affected': 1, 'subjects': []}


class TestReadEndpoints:
    def test_today_and_backlog(self, subject, student):
        lessons = _make_lessons(subject, 2)
        today = datetime.date.today()
        past = today - datetime.timedelta(days=3)

        StudentLesson.objects.create(student=student, lesson=lessons[0], scheduled_date=today)
        StudentLesson.objects.create(student=student, lesson=lessons[1], scheduled_date=past)

        today_items, backlog_items = services.get_today(student, today)
        assert len(today_items) == 1
        assert len(backlog_items) == 1
        assert backlog_items[0].scheduled_date == past

    def test_backlog_excludes_completed(self, subject, student):
        lessons = _make_lessons(subject, 1)
        past = datetime.date.today() - datetime.timedelta(days=3)
        sl = StudentLesson.objects.create(student=student, lesson=lessons[0], scheduled_date=past)
        lesson_services.start(sl, student.user)
        lesson_services.confirm_understanding(sl, student.user, True)

        backlog = services.get_backlog(student, datetime.date.today())
        assert len(backlog) == 0

    def test_backlog_label_format(self, subject, student):
        lessons = _make_lessons(subject, 2)
        monday = datetime.date(2025, 9, 1)
        assert monday.strftime('%A') == 'Monday'
        sl1 = StudentLesson.objects.create(student=student, lesson=lessons[0], scheduled_date=monday)
        sl2 = StudentLesson.objects.create(student=student, lesson=lessons[1], scheduled_date=monday)

        assert services.backlog_label(sl1) == 'Mon #1'
        assert services.backlog_label(sl2) == 'Mon #2'


class TestApiEndpoints:
    def test_generate_calendar_requires_tutor_scope(self, api_client, auth_header, subject, tutor):
        response = api_client.post(
            f'/schedule/subjects/{subject.id}/generate-calendar', headers=auth_header(tutor.user)
        )
        assert response.status_code == 403

    def test_generate_calendar_as_assigned_tutor(self, api_client, auth_header, subject, tutor, student):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        _make_lessons(subject, 2)

        response = api_client.post(
            f'/schedule/subjects/{subject.id}/generate-calendar', headers=auth_header(tutor.user)
        )
        assert response.status_code == 200
        assert response.data['lessons_scheduled'] == 2

    def test_manual_reschedule_via_api(self, api_client, auth_header, subject, tutor, student):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        lessons = _make_lessons(subject, 1)
        sl = StudentLesson.objects.create(
            student=student, lesson=lessons[0], scheduled_date=datetime.date.today()
        )

        new_date = datetime.date.today() + datetime.timedelta(days=5)
        response = api_client.post(
            f'/schedule/student-lessons/{sl.id}/reschedule',
            json={'scheduled_date': new_date.isoformat()},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 200
        sl.refresh_from_db()
        assert sl.scheduled_date == new_date
        assert sl.is_manually_scheduled is True

    def test_student_calendar_read(self, api_client, auth_header, subject, student):
        lessons = _make_lessons(subject, 1)
        today = datetime.date.today()
        StudentLesson.objects.create(student=student, lesson=lessons[0], scheduled_date=today)

        week_start = today - datetime.timedelta(days=today.weekday())
        response = api_client.get(
            f'/schedule/calendar?week_start={week_start.isoformat()}',
            headers=auth_header(student.user),
        )
        assert response.status_code == 200
        assert len(response.data) == 1

    def test_calendar_item_includes_grade_points(self, api_client, auth_header, subject, student):
        lessons = _make_lessons(subject, 1)
        today = datetime.date.today()
        sl = StudentLesson.objects.create(
            student=student,
            lesson=lessons[0],
            scheduled_date=today,
            status=StudentLessonStatus.COMPLETED,
            grade_points=9,
        )

        week_start = today - datetime.timedelta(days=today.weekday())
        response = api_client.get(
            f'/schedule/calendar?week_start={week_start.isoformat()}',
            headers=auth_header(student.user),
        )
        assert response.status_code == 200
        [item] = response.data
        assert item['id'] == sl.id
        assert item['grade_points'] == 9

    def test_calendar_item_icon_falls_back_from_lesson_to_subject(
        self, api_client, auth_header, subject, student, settings, tmp_path
    ):
        """Preschool game map step-node icon: lesson icon wins when set,
        otherwise the subject's icon is used. See
        docs/interfaces/preschool.md."""
        from django.core.files.base import ContentFile

        settings.MEDIA_ROOT = tmp_path
        subject.icon.save('subject.png', ContentFile(b'subject-bytes'), save=True)
        lessons = _make_lessons(subject, 2)
        lessons[0].icon.save('lesson.png', ContentFile(b'lesson-bytes'), save=True)
        today = datetime.date.today()
        StudentLesson.objects.create(student=student, lesson=lessons[0], scheduled_date=today)
        StudentLesson.objects.create(student=student, lesson=lessons[1], scheduled_date=today)

        week_start = today - datetime.timedelta(days=today.weekday())
        response = api_client.get(
            f'/schedule/calendar?week_start={week_start.isoformat()}',
            headers=auth_header(student.user),
        )
        assert response.status_code == 200
        items_by_lesson = {item['lesson_title']: item for item in response.data}

        with_own_icon = items_by_lesson['Lesson 1']
        assert with_own_icon['lesson_icon'] is not None
        assert with_own_icon['lesson_icon'] != with_own_icon['subject_icon']

        without_own_icon = items_by_lesson['Lesson 2']
        assert without_own_icon['lesson_icon'] is None
        assert without_own_icon['subject_icon'] is not None


class TestGenerateClassScheduleApi:
    def test_requires_tutor_scope(self, api_client, auth_header, subject, school_class, tutor):
        response = api_client.post(
            f'/schedule/classes/{school_class.id}/generate-schedule',
            json={
                'start_date': '2025-09-01', 'end_date': '2025-09-05',
                'subjects': [{'subject_id': subject.id, 'hours_per_week': 1}],
            },
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 403

    def test_generates_schedule_as_assigned_tutor(
        self, api_client, auth_header, subject, school_class, tutor, student
    ):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        _make_lessons(subject, 2)

        response = api_client.post(
            f'/schedule/classes/{school_class.id}/generate-schedule',
            json={
                'start_date': '2025-09-01', 'end_date': '2025-09-05',
                'subjects': [{'subject_id': subject.id, 'hours_per_week': 2}],
            },
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 200
        assert response.data['lessons_scheduled'] == 2
        assert response.data['subjects'] == [{'subject_id': subject.id, 'lessons_scheduled': 2}]

    def test_rejected_for_subject_the_tutor_does_not_teach(
        self, api_client, auth_header, subject, school_class, tutor, student
    ):
        # Assigned to a different subject in the same class, not `subject` itself.
        other_subject = Subject.objects.create(school_class=school_class, name='History')
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=other_subject)
        _make_lessons(subject, 1)

        response = api_client.post(
            f'/schedule/classes/{school_class.id}/generate-schedule',
            json={
                'start_date': '2025-09-01', 'end_date': '2025-09-05',
                'subjects': [{'subject_id': subject.id, 'hours_per_week': 1}],
            },
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 403

    def test_rejected_for_subject_from_another_class(
        self, api_client, auth_header, subject, school_class, tutor, student
    ):
        other_school = School.objects.create(name='Other School')
        other_class = Class.objects.create(
            school=other_school, name='9', order_index=9, academic_year='2025/2026'
        )
        foreign_subject = Subject.objects.create(school_class=other_class, name='Chemistry')
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=foreign_subject)
        _make_lessons(foreign_subject, 1)

        response = api_client.post(
            f'/schedule/classes/{school_class.id}/generate-schedule',
            json={
                'start_date': '2025-09-01', 'end_date': '2025-09-05',
                'subjects': [{'subject_id': foreign_subject.id, 'hours_per_week': 1}],
            },
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 400

    def test_rejected_when_start_after_end(self, api_client, auth_header, subject, school_class, tutor, student):
        TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)

        response = api_client.post(
            f'/schedule/classes/{school_class.id}/generate-schedule',
            json={
                'start_date': '2025-09-05', 'end_date': '2025-09-01',
                'subjects': [{'subject_id': subject.id, 'hours_per_week': 1}],
            },
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 400
