import datetime

from django.db.models import Prefetch

from academics.models import Subject
from accounts.models import StudentProfile
from lessons import services as lesson_services
from lessons.models import Lesson, StudentLesson, StudentLessonStatus

WEEKDAYS_PER_SCHOOL_WEEK = 5


def _split_evenly(items: list, n_groups: int) -> list[list]:
    """Even split with any remainder going to the first groups — the same
    rule docs/core/data.md specifies for subject blocks, reused here for
    weeks. See docs/architecture/08-calendar-generation.md."""
    n_groups = max(1, n_groups)
    base, remainder = divmod(len(items), n_groups)
    groups = []
    idx = 0
    for i in range(n_groups):
        size = base + (1 if i < remainder else 0)
        groups.append(items[idx: idx + size])
        idx += size
    return groups


def _week_starts(start_date: datetime.date, due_date: datetime.date) -> list[datetime.date]:
    first_monday = start_date - datetime.timedelta(days=start_date.weekday())
    weeks = []
    current = first_monday
    while current <= due_date:
        weeks.append(current)
        current += datetime.timedelta(days=7)
    return weeks or [first_monday]


def generate_calendar_for_subject(subject: Subject) -> dict:
    """Distributes the subject's lessons (in topic/lesson order_index order)
    evenly across [start_date, due_date] weeks, and creates/updates a
    StudentLesson per enrolled student per lesson via
    lessons.services.sync_scheduled_lesson (which silently skips
    completed/manually-scheduled rows). Runs synchronously — see
    docs/architecture/08-calendar-generation.md."""
    topics = subject.topics.order_by('order_index').prefetch_related(
        Prefetch('lessons', queryset=Lesson.objects.order_by('order_index'))
    )
    all_lessons = [lesson for topic in topics for lesson in topic.lessons.all()]
    students = list(StudentProfile.objects.filter(school_class=subject.school_class))

    if not all_lessons or not students:
        return {'lessons_scheduled': 0, 'students_affected': len(students)}

    week_starts = _week_starts(subject.start_date, subject.due_date)
    lesson_groups_by_week = _split_evenly(all_lessons, len(week_starts))

    blocks = list(subject.blocks.order_by('index'))
    lesson_to_block = {}
    if blocks:
        for block, lessons_in_block in zip(blocks, _split_evenly(all_lessons, len(blocks))):
            for lesson in lessons_in_block:
                lesson_to_block[lesson.id] = block

    scheduled_count = 0
    for week_start, lessons_in_week in zip(week_starts, lesson_groups_by_week):
        for i, lesson in enumerate(lessons_in_week):
            scheduled_date = week_start + datetime.timedelta(days=i % WEEKDAYS_PER_SCHOOL_WEEK)
            subject_block = lesson_to_block.get(lesson.id)
            for student in students:
                lesson_services.sync_scheduled_lesson(student, lesson, scheduled_date, subject_block)
                scheduled_count += 1

    return {'lessons_scheduled': scheduled_count, 'students_affected': len(students)}


def get_week_calendar(student: StudentProfile, week_start: datetime.date) -> list[StudentLesson]:
    week_end = week_start + datetime.timedelta(days=6)
    return list(
        StudentLesson.objects.filter(
            student=student, scheduled_date__gte=week_start, scheduled_date__lte=week_end
        ).select_related('lesson').order_by('scheduled_date')
    )


def get_backlog(student: StudentProfile, before: datetime.date) -> list[StudentLesson]:
    """Computed at query time, never persisted. See
    docs/architecture/02-data-model.md decision 2."""
    return list(
        StudentLesson.objects.filter(
            student=student, scheduled_date__lt=before
        ).exclude(status=StudentLessonStatus.COMPLETED).select_related('lesson').order_by('scheduled_date')
    )


def get_today(student: StudentProfile, date: datetime.date) -> tuple[list[StudentLesson], list[StudentLesson]]:
    today_lessons = list(
        StudentLesson.objects.filter(student=student, scheduled_date=date)
        .select_related('lesson').order_by('id')
    )
    return today_lessons, get_backlog(student, date)


def backlog_label(student_lesson: StudentLesson) -> str:
    """'Mon #4' — weekday abbreviation + ordinal position among that day's
    lessons. See docs/interfaces/student/calendar.md and today.md."""
    weekday_abbrev = student_lesson.scheduled_date.strftime('%a')
    same_day_ids = list(
        StudentLesson.objects.filter(
            student_id=student_lesson.student_id, scheduled_date=student_lesson.scheduled_date
        ).order_by('id').values_list('id', flat=True)
    )
    position = same_day_ids.index(student_lesson.id) + 1
    return f'{weekday_abbrev} #{position}'
