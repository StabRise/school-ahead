import datetime

from ninja import Schema

from accounts.schemas import AvatarItemOut, AvatarOut
from house.schemas import FurnitureTextureOut
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
    avatar_url: str = ''
    # Only populated (get_tutor_student) for the tutor's single-student
    # overview page — every list endpoint sharing this schema (list_students,
    # list_assignable_students, the class roster) leaves these at their
    # empty defaults rather than paying the extra avatar/wardrobe queries
    # per row. See accounts.schemas.UserOut for the identical shape this
    # mirrors (accounts.services.avatar_out/equipped_items_out).
    equipped_avatar: AvatarOut | None = None
    equipped_clothing_items: list[AvatarItemOut] = []
    equipped_headwear_items: list[AvatarItemOut] = []
    equipped_accessory_items: list[AvatarItemOut] = []


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


class PlanOut(Schema):
    id: int
    school_class_id: int
    semester_name: str
    created_at: datetime.datetime


class ImportPlanOut(Schema):
    plan_id: int
    semester_name: str
    subjects_found: list[str]
    subjects_added: list[str]
    blocks_updated: int


class SubjectMarkdownTopicOut(Schema):
    id: int
    title: str


class SubjectMarkdownLessonOut(Schema):
    id: int
    title: str
    is_new: bool


class ImportSubjectMarkdownOut(Schema):
    subject_id: int
    subject_name: str
    subject_created: bool
    blocks_count: int
    topics_created: int
    topics_reused: int
    topics: list[SubjectMarkdownTopicOut]
    lessons_created: int
    lessons_skipped: int
    lessons: list[SubjectMarkdownLessonOut]


class TutorFurnitureItemOut(Schema):
    """A house.FurnitureItem catalog row, from the furniture editor's point
    of view — every item (active or not), with no per-student is_owned/
    placement (unlike house.schemas.FurnitureItemOut). See
    tutoring.api.list_tutor_furniture."""

    id: int
    key: str
    name: str
    model_file: str
    model_format: str  # "obj" | "stl" — see house.services.model_format
    material_file: str | None
    textures: list[FurnitureTextureOut]
    thumbnail_image: str
    price: int
    # "floor" | "wall" | "ceiling" — see house.models.FurnitureSurface.
    surface: str
    default_scale: float
    default_rotation: list[float]
    # A small nudge off the literal surface plane — see
    # house-3d's lib/surface.ts, which clamps it to a modest range so a
    # model whose own pivot isn't at its base (making it look sunk into the
    # floor, or floating off the wall/ceiling) can be corrected without
    # letting an item drift away from its surface entirely.
    default_position: list[float]
    is_active: bool


class UpdateTutorFurnitureItemIn(Schema):
    """The furniture editor's scale/rotate/position/price/surface
    controls — see tutoring.api.update_tutor_furniture_item."""

    price: int
    surface: str
    default_scale: float
    default_rotation: list[float]
    default_position: list[float]
