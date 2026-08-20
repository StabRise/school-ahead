import datetime

from ninja import Schema


class AssignmentOut(Schema):
    subject_id: int
    subject_name: str
    class_id: int
    class_name: str


class TutorFeedItemOut(Schema):
    student_lesson_id: int
    student_name: str
    class_name: str
    subject_name: str
    lesson_title: str
    status: str
    help_note: str
    scheduled_date: datetime.date


class LessonSubmissionOut(Schema):
    id: int
    file: str | None
    comment: str
    submitted_at: datetime.datetime
    is_latest: bool

    @staticmethod
    def resolve_file(obj):
        return obj.file.url if obj.file else None


class SubmissionDetailOut(Schema):
    student_lesson_id: int
    student_name: str
    lesson_title: str
    status: str
    submissions: list[LessonSubmissionOut]


class GradeIn(Schema):
    grade_points: int | None = None
    grade_result: str | None = None
    feedback: str = ''


class RequestRevisionIn(Schema):
    feedback: str


class ResolveNeedHelpIn(Schema):
    to_status: str  # "in_progress" or "completed"
    grade_points: int | None = None
    grade_result: str | None = None
    feedback: str = ''
