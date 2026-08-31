import datetime

from ninja import Schema

from lessons.schemas import LessonSubmissionOut


class AssignmentOut(Schema):
    subject_id: int
    subject_name: str
    subject_icon: str | None
    class_id: int
    class_name: str
    topic_count: int
    lesson_count: int
    is_filled: bool
    # One entry per SubjectBlock, in index order (Semester 1, Semester 2, …)
    # — null for a block whose workload hasn't been computed (see
    # academics.services.recompute_block_workload).
    block_workloads: list[float | None]


class LessonStudentOut(Schema):
    student_lesson_id: int
    student_id: int
    student_name: str
    scheduled_date: datetime.date
    status: str


class SubjectLessonStudentOut(Schema):
    """One row per lesson/student assignment across a whole subject — powers
    the tutor's Subject detail page "full" and "student" list views, which
    need assignment data for every lesson at once rather than one lesson at
    a time (see list_tutor_lesson_students for the single-lesson version)."""

    student_lesson_id: int
    lesson_id: int
    student_id: int
    student_name: str
    scheduled_date: datetime.date
    status: str
    grade_points: int | None
    grade_result: str | None


class TutorFeedItemOut(Schema):
    student_lesson_id: int
    student_id: int
    student_name: str
    class_id: int
    class_name: str
    subject_id: int
    subject_name: str
    lesson_title: str
    status: str
    help_note: str
    scheduled_date: datetime.date
    updated_at: datetime.datetime


class TutorStudentOut(Schema):
    id: int
    name: str
    class_id: int
    class_name: str
    # Denormalized on StudentProfile (same pattern as diamond_balance_cache) —
    # see lessons.services._update_completion_percent_cache, refreshed on
    # every lesson completion rather than computed here on every request.
    completed_percent: float


class TutorClassOut(Schema):
    id: int
    name: str
    academic_year: str
    class_teacher_name: str | None
    is_class_teacher: bool
    student_count: int
    subject_count: int


class TutorClassDetailOut(TutorClassOut):
    students: list[TutorStudentOut]
    subjects: list[AssignmentOut]


class SubmissionDetailOut(Schema):
    student_lesson_id: int
    student_id: int
    student_name: str
    class_id: int
    class_name: str
    subject_id: int
    subject_name: str
    lesson_id: int
    lesson_title: str
    status: str
    grading_type: str
    help_note: str
    task_content: str
    scheduled_date: datetime.date
    submissions: list[LessonSubmissionOut]


class GradeIn(Schema):
    grade_points: int | None = None
    grade_result: str | None = None
    feedback: str = ''


class ResolveNeedHelpIn(Schema):
    to_status: str  # "in_progress" or "completed"
    grade_points: int | None = None
    grade_result: str | None = None
    feedback: str = ''


class AssignStudentIn(Schema):
    student_id: int
    scheduled_date: datetime.date


class AssignableLessonOut(Schema):
    """One not-yet-assigned Lesson for a student in a given subject — powers
    the "existing lesson" picker in the calendar day's "+" popup, listed in
    curriculum order (topic order_index, then lesson order_index)."""

    id: int
    title: str
    topic_title: str
    lesson_type: str


class AssignDayLessonIn(Schema):
    """Payload for the calendar day's "+" popup (tutoring.api.assign_day_lesson).
    is_new=false picks an existing not-yet-assigned lesson (lesson_id);
    is_new=true creates a one-off lesson under the subject's "Extra" topic
    from title/content/task_content."""

    subject_id: int
    scheduled_date: datetime.date
    is_new: bool
    lesson_id: int | None = None
    title: str | None = None
    content: str | None = None
    task_content: str = ''


class SetTopicBlockIn(Schema):
    subject_block_id: int


class SetSubjectFilledIn(Schema):
    is_filled: bool
