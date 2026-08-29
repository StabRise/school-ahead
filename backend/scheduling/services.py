import datetime

from django.db.models import Prefetch
from django.utils import timezone

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
    lessons_count_by_subject: dict[int, int],
) -> dict:
    """The tutor's "Plan Lessons" modal on the class detail page: freely
    picks a date range and how many lessons of each subject to fit into
    it — a direct count for the period, not a weekly rate — rather than
    working off each Subject's own start_date/due_date the way
    generate_calendar_for_subject does.

    Full reflow, not pure addition: for each requested subject, every
    not-yet-completed StudentLesson already scheduled on/after start_date
    is treated as up for grabs alongside the newly requested lessons —
    completion is the only hard stop (matching generate_calendar_for_subject's
    recalculation rule), a manually-scheduled-but-incomplete row is fair
    game too. Since lessons are always taken in topic/lesson order_index
    order, merging "already scheduled later" with "brand new" candidates
    and re-sorting by that order guarantees a student never sees a later
    lesson land on an earlier day than an earlier one — even when this call
    plans an earlier gap after a later week was already scheduled (e.g.
    lessons 1-3 sitting next week, and the tutor backfilling this week with
    lessons 4-8: the whole batch 1-8 is redistributed across
    [start_date .. latest already-scheduled date], not just the newly
    requested lessons squeezed into the requested range).

    For each subject, school days (across that possibly-widened range) are
    ranked by current load (fewest lessons already placed there first, then
    days that don't already carry that subject, then earliest date), and
    the subject's lessons are split into contiguous chunks — via
    _split_evenly, remainder going to the front — handed out to those days
    most-preferred-first. So the least-loaded/least-conflicting days absorb
    the biggest chunks while a subject's own lessons still land in order
    across the days it's given. Repeats are allowed once every day in range
    already has that subject — see the "Plan Lessons" modal's info note."""
    students = list(StudentProfile.objects.filter(school_class=school_class))
    empty_result = {'lessons_scheduled': 0, 'students_affected': len(students), 'subjects': []}
    if not students or not _school_days(start_date, end_date):
        return empty_result

    # One representative student's existing schedule stands in for the
    # whole class's current load — StudentLesson dates are computed once
    # per class and applied uniformly to every student, the same assumption
    # generate_calendar_for_subject makes.
    representative = students[0]

    subject_lessons: dict[int, list[Lesson]] = {}
    subject_end_date: dict[int, datetime.date] = {}
    for subject_id, lessons_count in lessons_count_by_subject.items():
        if lessons_count <= 0:
            continue

        movable_existing = list(
            StudentLesson.objects.filter(
                student=representative, lesson__topic__subject_id=subject_id, scheduled_date__gte=start_date,
            )
            .exclude(status=StudentLessonStatus.COMPLETED)
            .select_related('lesson__topic')
        )
        new_lessons = list(
            Lesson.objects.filter(topic__subject_id=subject_id)
            .exclude(student_lessons__isnull=False)
            .order_by('topic__order_index', 'order_index')[:lessons_count]
        )
        lessons = sorted(
            [sl.lesson for sl in movable_existing] + new_lessons,
            key=lambda lesson: (lesson.topic.order_index, lesson.order_index),
        )
        if not lessons:
            continue

        subject_lessons[subject_id] = lessons
        subject_end_date[subject_id] = max([end_date] + [sl.scheduled_date for sl in movable_existing])

    if not subject_lessons:
        return empty_result

    overall_end_date = max(subject_end_date.values())
    school_days = _school_days(start_date, overall_end_date)

    # Every lesson gathered above (reflowed or brand new) is about to be
    # (re)placed by the loop below, so its current placement shouldn't
    # count as "load" when ranking days — only what this call isn't
    # touching (other subjects, and this subject's own completed rows)
    # forms the starting load.
    reflowed_lesson_ids = {lesson.id for lessons in subject_lessons.values() for lesson in lessons}
    day_total = dict.fromkeys(school_days, 0)
    day_subjects: dict[datetime.date, set[int]] = {day: set() for day in school_days}
    fixed_existing = (
        StudentLesson.objects.filter(
            student=representative, scheduled_date__gte=start_date, scheduled_date__lte=overall_end_date,
        )
        .exclude(lesson_id__in=reflowed_lesson_ids)
        .select_related('lesson__topic')
    )
    for student_lesson in fixed_existing:
        day = student_lesson.scheduled_date
        day_total[day] = day_total.get(day, 0) + 1
        day_subjects.setdefault(day, set()).add(student_lesson.lesson.topic.subject_id)

    scheduled_per_subject = dict.fromkeys(subject_lessons, 0)
    for subject_id, lessons in subject_lessons.items():
        eligible_days = _school_days(start_date, subject_end_date[subject_id])
        days_by_preference = sorted(
            eligible_days,
            key=lambda day: (day_total[day], subject_id in day_subjects[day], day),
        )
        chunks = _split_evenly(lessons, len(days_by_preference))
        for chosen_day, chunk in zip(days_by_preference, chunks):
            for lesson in chunk:
                for student in students:
                    lesson_services.sync_scheduled_lesson(student, lesson, chosen_day)
                # sync_scheduled_lesson intentionally leaves manually-
                # scheduled rows alone; a full reflow overrides that too —
                # completion is the only hard stop here — so force those
                # specific rows onto the new date and clear the manual
                # flag, since they're auto-planned again.
                StudentLesson.objects.filter(student__in=students, lesson=lesson, is_manually_scheduled=True).exclude(
                    status=StudentLessonStatus.COMPLETED
                ).update(scheduled_date=chosen_day, is_manually_scheduled=False)
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


def get_week_completion_counts(student: StudentProfile, week_start: datetime.date) -> dict:
    """Data for the dashboard's weekly-progress sidebar:
    - 'days': Mon-Sun histogram — per calendar day, how many of the
      student's lessons were completed (StudentLesson.completed_at) that
      day, independent of scheduled_date, so a backlog lesson finished
      today counts under today, not under whatever day it was originally
      scheduled for. completed_at is converted to the local calendar day
      (see TIME_ZONE=UTC, USE_TZ=True in settings) before bucketing.
    - 'completed_percent': of the lessons actually scheduled for this week
      (scheduled_date, not completed_at), what fraction are Completed —
      the week's own overall progress bar, same completed/total shape as
      lessons.services.compute_completion."""
    week_end = week_start + datetime.timedelta(days=6)
    completed_at_values = StudentLesson.objects.filter(
        student=student,
        completed_at__date__gte=week_start,
        completed_at__date__lte=week_end,
    ).values_list('completed_at', flat=True)

    counts = [0] * 7
    for completed_at in completed_at_values:
        day_index = timezone.localtime(completed_at).date().weekday()
        counts[day_index] += 1

    days = [
        {'date': week_start + datetime.timedelta(days=i), 'weekday': i, 'completed_count': counts[i]}
        for i in range(7)
    ]

    scheduled_this_week = StudentLesson.objects.filter(
        student=student, scheduled_date__gte=week_start, scheduled_date__lte=week_end
    )
    total_scheduled = scheduled_this_week.count()
    total_completed = scheduled_this_week.filter(status=StudentLessonStatus.COMPLETED).count()
    completed_percent = round(total_completed / total_scheduled * 100, 1) if total_scheduled else 0.0

    return {'days': days, 'completed_percent': completed_percent}


def backlog_label(student_lesson: StudentLesson) -> str:
    """ISO date the lesson was originally scheduled for — the frontend
    formats it for display (see docs/interfaces/student/calendar.md and
    today.md), same as every other date field in this API."""
    return student_lesson.scheduled_date.isoformat()
