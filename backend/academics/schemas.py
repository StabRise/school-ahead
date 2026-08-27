import datetime

from ninja import Schema


def _absolute_file_url(file_field, context: dict) -> str | None:
    """See lessons/schemas.py's identical helper — file URLs are
    host-relative and the frontend is a separate origin (no BFF)."""
    if not file_field:
        return None
    request = context.get('request')
    return request.build_absolute_uri(file_field.url) if request else file_field.url


class SchoolOut(Schema):
    id: int
    name: str
    locale_default: str
    timezone: str


class ClassOut(Schema):
    id: int
    school_id: int
    name: str
    order_index: int
    academic_year: str
    class_teacher_id: int | None
    class_teacher_name: str | None

    @staticmethod
    def resolve_class_teacher_name(obj):
        if not obj.class_teacher_id:
            return None
        teacher_user = obj.class_teacher.user
        return teacher_user.full_name or teacher_user.email


class SubjectBlockOut(Schema):
    id: int
    index: int
    label: str
    status: str
    starts_on: datetime.date | None
    ends_on: datetime.date | None


class SubjectOut(Schema):
    id: int
    school_class_id: int
    class_name: str
    name: str
    description: str
    recommended_resources: str
    block_count: int
    start_date: datetime.date
    due_date: datetime.date
    is_filled: bool
    blocks: list[SubjectBlockOut]
    icon: str | None
    color: str
    teacher_name: str | None

    @staticmethod
    def resolve_class_name(obj):
        return obj.school_class.name

    @staticmethod
    def resolve_blocks(obj):
        return list(obj.blocks.all())

    @staticmethod
    def resolve_icon(obj, context):
        return _absolute_file_url(obj.icon, context)

    @staticmethod
    def resolve_teacher_name(obj):
        # A subject can have multiple active tutors (tutoring.TutorSubjectAssignment
        # is a M2M join, not a single FK) — join their display names.
        names = [
            assignment.tutor.user.full_name or assignment.tutor.user.email
            for assignment in obj.tutor_assignments.filter(is_active=True).select_related('tutor__user')
        ]
        return ', '.join(names) or None


class TopicOut(Schema):
    id: int
    subject_id: int
    title: str
    description: str
    order_index: int
    lesson_count: int
    subject_block_id: int | None
    subject_block_label: str | None

    @staticmethod
    def resolve_lesson_count(obj):
        return obj.lessons.count()

    @staticmethod
    def resolve_subject_block_label(obj):
        return obj.subject_block.label if obj.subject_block else None


class SubjectPatchIn(Schema):
    start_date: datetime.date | None = None
    due_date: datetime.date | None = None
    block_count: int | None = None


class TopicOrderIn(Schema):
    id: int
    order_index: int


class TopicsReorderIn(Schema):
    items: list[TopicOrderIn]


class SchoolIn(Schema):
    name: str
    locale_default: str = 'uk'
    timezone: str = 'Europe/Kyiv'


class ClassIn(Schema):
    school_id: int
    name: str
    order_index: int
    academic_year: str
    class_teacher_id: int | None = None


class SubjectIn(Schema):
    school_class_id: int
    name: str
    description: str = ''
    recommended_resources: str = ''
    block_count: int = 2
    start_date: datetime.date | None = None
    due_date: datetime.date | None = None
    color: str = ''


class TopicIn(Schema):
    subject_id: int
    title: str
    description: str = ''
    order_index: int
