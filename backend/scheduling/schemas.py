import datetime

from ninja import Schema


class CalendarItemOut(Schema):
    id: int
    lesson_id: int
    subject_id: int
    lesson_title: str
    topic_title: str
    subject_name: str
    # Curriculum order within the subject — lets a list mixing lessons from
    # several subjects be sorted subject-name-first, then by these as a
    # tiebreaker (see Topic.order_index / Lesson.order_index).
    topic_order_index: int
    lesson_order_index: int
    status: str
    # Whether the student has submitted work for this lesson yet — lets the
    # tutor's calendar only offer to remove an In Progress lesson before any
    # submission exists. See lessons.models.LessonSubmission.
    has_submission: bool
    scheduled_date: datetime.date
    completed_at: datetime.datetime | None
    is_completed_ahead: bool
    grade_points: int | None
    grade_result: str | None
    # Preschool game map step-node icon, falling back lesson -> subject ->
    # a frontend default when both are empty. See docs/interfaces/preschool.md.
    lesson_icon: str | None
    subject_icon: str | None
    # Subject.color left-border accent on the calendar's lesson cards.
    subject_color: str | None
    # theory / with_quiz / with_task — drives the lesson-type icon on the
    # student dashboard's LessonRow. See Lesson.lesson_type.
    lesson_type: str
    # Only non-empty when lesson_type=with_task — shown as the row's task
    # preview. See Lesson.task_content.
    task_content: str
    # Whether the student picked this lesson themselves (via
    # lessons.api.start_lesson_today) rather than a tutor assigning it —
    # see StudentLesson.is_self_selected. Only meaningful (and only shown
    # by the frontend) for a student with can_do_any_lesson set.
    is_self_selected: bool
    # Whether the student may remove this lesson from their own list right
    # now (lessons.api.cancel_self_selected_lesson): they picked it
    # themselves, it isn't finished, and nothing has been submitted or said
    # on it yet. Computed here so the frontend's minus button never has to
    # guess the rule — the preschool dashboard's road only shows it when true.
    can_cancel: bool


class BacklogItemOut(CalendarItemOut):
    origin_label: str


class TodayOut(Schema):
    today: list[CalendarItemOut]
    backlog: list[BacklogItemOut]


class DailyCompletionOut(Schema):
    """One day's worth of the weekly-progress histogram — how many of the
    student's lessons were actually completed (StudentLesson.completed_at)
    that calendar day, regardless of which day they'd been scheduled for."""

    date: datetime.date
    weekday: int  # 0=Monday .. 6=Sunday
    completed_count: int


class WeeklyCompletionOut(Schema):
    days: list[DailyCompletionOut]
    # Of the lessons scheduled for this week (not completed_at-based like
    # `days` above), what % are Completed. See
    # services.get_week_completion_counts.
    completed_percent: float


class GenerateCalendarOut(Schema):
    lessons_scheduled: int
    students_affected: int


class RescheduleIn(Schema):
    scheduled_date: datetime.date


class SubjectLessonsIn(Schema):
    subject_id: int
    lessons_count: int = 0
    # "Рендомні уроки" checkbox on the Plan Lessons popup — picks
    # `lessons_count` not-yet-assigned lessons of this subject at random
    # (instead of the next ones in topic/lesson order_index order) and
    # hands them out to days in that random order too, rather than
    # re-sorted back into curriculum order. See
    # services.generate_class_schedule.
    randomize: bool = False


class GenerateClassScheduleIn(Schema):
    start_date: datetime.date
    end_date: datetime.date
    subjects: list[SubjectLessonsIn]


class SubjectScheduledOut(Schema):
    subject_id: int
    lessons_scheduled: int


class GenerateClassScheduleOut(Schema):
    lessons_scheduled: int
    students_affected: int
    subjects: list[SubjectScheduledOut]
