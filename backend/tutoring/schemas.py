import datetime

from ninja import Schema

from lessons.schemas import LessonSubmissionOut


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


class TutorStudentOut(Schema):
    id: int
    name: str
    class_id: int
    class_name: str


class SubmissionDetailOut(Schema):
    student_lesson_id: int
    student_name: str
    class_name: str
    subject_name: str
    lesson_title: str
    status: str
    grading_type: str
    help_note: str
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
