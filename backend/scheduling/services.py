import datetime

from django.db.models import Prefetch

from academics import services as academics_services
from academics.models import Class, Subject
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
    docs/architecture/08-calendar-generation.md. Also refreshes the
    Topic->SubjectBlock assignment first (academics.services), in case blocks
    or topics changed since the last time it ran."""
    academics_services.assign_topics_to_blocks(subject)

    topics = subject.topics.order_by('order_index').prefetch_related(
        Prefetch('lessons', queryset=Lesson.objects.order_by('order_index'))
    )
    all_lessons = [lesson for topic in topics for lesson in topic.lessons.all()]
    students = list(StudentProfile.objects.filter(school_class=subject.school_class))

    if not all_lessons or not students:
        return {'lessons_scheduled': 0, 'students_affected': len(students)}

    week_starts = _week_starts(subject.start_date, subject.due_date)
    lesson_groups_by_week = _split_evenly(all_lessons, len(week_starts))

    scheduled_count = 0
    for week_start, lessons_in_week in zip(week_starts, lesson_groups_by_week):
        for i, lesson in enumerate(lessons_in_week):
            scheduled_date = week_start + datetime.timedelta(days=i % WEEKDAYS_PER_SCHOOL_WEEK)
            for student in students:
                lesson_services.sync_scheduled_lesson(student, lesson, scheduled_date)
                scheduled_count += 1

    return {'lessons_scheduled': scheduled_count, 'students_affected': len(students)}


def _school_days(start_date: datetime.date, end_date: datetime.date) -> list[datetime.date]:
    """Weekdays (Mon-Fri) only, inclusive — same school-week convention as
    WEEKDAYS_PER_SCHOOL_WEEK above."""
    days = []
    current = start_date
    while current <= end_date:
        if current.weekday() < WEEKDAYS_PER_SCHOOL_WEEK:
            days.append(current)
        current += datetime.timedelta(days=1)
    return days


def generate_class_schedule(
    school_class: Class,
    start_date: datetime.date,
    end_date: datetime.date,
    hours_per_week_by_subject: dict[int, int],
) -> dict:
    """The tutor's "Plan Lessons" modal on the class detail page: freely
    picks a date range and a weekly-hours target per subject, rather than
    working off each Subject's own start_date/due_date the way
    generate_calendar_for_subject does.

    Only ever schedules lessons that have *no* StudentLesson for anyone in
    the class yet (never touches an already-scheduled/completed/manually-
    scheduled lesson) — this is additive planning, not a recalculation.

    Day assignment greedily balances load and minimizes same-subject
    repeats on the same day: candidate lessons across all requested subjects
    are interleaved round-robin, and each one goes to the school day (within
    the range) with the fewest lessons already placed there, preferring
    (among ties) a day that doesn't already carry that subject. This
    intentionally starts from whatever is *already* scheduled in the range
    (from earlier generation runs, manual assignments, or other subjects)
    rather than a blank slate, so a second "Plan Lessons" run — or a
    request that only touches some of a class's subjects — still spreads
    load and avoids duplicates against what's already there. Repeats are
    allowed once every day in range already has that subject — see the
    "Plan Lessons" modal's info note."""
    students = list(StudentProfile.objects.filter(school_class=school_class))
    school_days = _school_days(start_date, end_date)
    empty_result = {'lessons_scheduled': 0, 'students_affected': len(students), 'subjects': []}
    if not students or not school_days:
        return empty_result

    weeks_in_period = len(school_days) / WEEKDAYS_PER_SCHOOL_WEEK

    # One representative student's existing schedule stands in for the
    # whole class's current load — StudentLesson dates are computed once
    # per class and applied uniformly to every student, the same assumption
    # generate_calendar_for_subject makes.
    representative = students[0]
    day_total = dict.fromkeys(school_days, 0)
    day_subjects: dict[datetime.date, set[int]] = {day: set() for day in school_days}
    existing = StudentLesson.objects.filter(
        student=representative, scheduled_date__gte=start_date, scheduled_date__lte=end_date,
    ).select_related('lesson__topic')
    for student_lesson in existing:
        day = student_lesson.scheduled_date
        day_total[day] = day_total.get(day, 0) + 1
        day_subjects.setdefault(day, set()).add(student_lesson.lesson.topic.subject_id)

    subject_tasks: dict[int, list[Lesson]] = {}
    for subject_id, hours_per_week in hours_per_week_by_subject.items():
        if hours_per_week <= 0:
            continue
        target_count = round(hours_per_week * weeks_in_period)
        if target_count <= 0:
            continue
        lessons = list(
            Lesson.objects.filter(topic__subject_id=subject_id)
            .exclude(student_lessons__isnull=False)
            .order_by('topic__order_index', 'order_index')[:target_count]
        )
        if lessons:
            subject_tasks[subject_id] = lessons

    if not subject_tasks:
        return empty_result

    # Round-robin across subjects (one lesson from each in turn) so a
    # subject with a big target doesn't claim every best day before the
    # others get a turn.
    task_queue: list[tuple[int, Lesson]] = []
    max_len = max(len(lessons) for lessons in subject_tasks.values())
    for i in range(max_len):
        for subject_id, lessons in subject_tasks.items():
            if i < len(lessons):
                task_queue.append((subject_id, lessons[i]))

    scheduled_per_subject = dict.fromkeys(subject_tasks, 0)
    for subject_id, lesson in task_queue:
        chosen_day = min(
            school_days,
            key=lambda day: (day_total[day], subject_id in day_subjects[day], day),
        )
        for student in students:
            lesson_services.sync_scheduled_lesson(student, lesson, chosen_day)
        day_total[chosen_day] += 1
        day_subjects[chosen_day].add(subject_id)
        scheduled_per_subject[subject_id] += 1

    return {
        # Top-level count is StudentLesson rows touched (lessons × students),
        # matching generate_calendar_for_subject's 'lessons_scheduled'
        # convention; the per-subject breakdown below is distinct lessons
        # (more meaningful to a tutor reading "Математика: 4").
        'lessons_scheduled': sum(scheduled_per_subject.values()) * len(students),
        'students_affected': len(students),
        'subjects': [
            {'subject_id': subject_id, 'lessons_scheduled': count}
            for subject_id, count in scheduled_per_subject.items()
        ],
    }


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
