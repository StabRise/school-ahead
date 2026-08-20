import datetime

from ninja import Schema


class CalendarItemOut(Schema):
    id: int
    lesson_title: str
    subject_name: str
    status: str
    scheduled_date: datetime.date
    completed_at: datetime.datetime | None
    is_completed_ahead: bool
    grade_points: int | None
    # Preschool game map step-node icon, falling back lesson -> subject ->
    # a frontend default when both are empty. See docs/interfaces/preschool.md.
    lesson_icon: str | None
    subject_icon: str | None


class BacklogItemOut(CalendarItemOut):
    origin_label: str


class TodayOut(Schema):
    today: list[CalendarItemOut]
    backlog: list[BacklogItemOut]


class GenerateCalendarOut(Schema):
    lessons_scheduled: int
    students_affected: int


class RescheduleIn(Schema):
    scheduled_date: datetime.date
