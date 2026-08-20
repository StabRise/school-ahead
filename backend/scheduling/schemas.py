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
