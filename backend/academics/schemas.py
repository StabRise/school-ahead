import datetime

from ninja import Schema

from common.images import icon_url


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


class SubjectGroupOut(Schema):
    id: int
    name: str
    order_index: int
    icon: str | None
    # Shown in the preschool bookshelf's default view — see SubjectGroup.is_marked.
    is_marked: bool

    @staticmethod
    def resolve_icon(obj, context):
        return icon_url(obj, context.get('request'))


class SubjectBlockOut(Schema):
    id: int
    index: int
    label: str
    description: str
    status: str
    starts_on: datetime.date | None
    ends_on: datetime.date | None
    weeks_count: int | None
    workload: float | None


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
    group_id: int | None
    group_name: str | None
    order_index: int
    attestation_type: str
    # Shown in the preschool bookshelf's default view — see Subject.is_marked.
    is_marked: bool

    @staticmethod
    def resolve_class_name(obj):
        return obj.school_class.name

    @staticmethod
    def resolve_group_name(obj):
        return obj.group.name if obj.group_id else None

    @staticmethod
    def resolve_blocks(obj):
        return list(obj.blocks.all())

    @staticmethod
    def resolve_icon(obj, context):
        return icon_url(obj, context.get('request'))

    @staticmethod
    def resolve_teacher_name(obj):
        # A subject can have multiple active tutors (tutoring.TutorSubjectAssignment
        # is a M2M join, not a single FK) — join their display names.
        names = [
            assignment.tutor.user.full_name or assignment.tutor.user.email
            for assignment in obj.tutor_assignments.filter(is_active=True).select_related('tutor__user')
        ]
        return ', '.join(names) or None


class PublicSubjectOut(Schema):
    """A subject as a visitor who isn't signed in sees it (academics.public_api).
    Deliberately much smaller than SubjectOut: no teacher_name (it falls back
    to the tutor's e-mail address), dates, attestation or workload — only
    what the preschool-style bookshelf and subject page draw."""

    id: int
    name: str
    icon: str | None
    group_id: int | None
    # Shown in the shelf's default "marked by tutor" view — see Subject.is_marked.
    is_marked: bool

    @staticmethod
    def resolve_icon(obj, context):
        return icon_url(obj, context.get('request'))


class SubjectMaterialOut(Schema):
    id: int
    subject_id: int
    file: str | None
    title: str
    order_index: int

    @staticmethod
    def resolve_file(obj, context):
        return _absolute_file_url(obj.file, context)


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
        # A queryset that already counted them (annotate(lesson_total=Count(...)),
        # see topics_with_lesson_counts) saves a COUNT query per topic.
        total = getattr(obj, 'lesson_total', None)
        return total if total is not None else obj.lessons.count()

    @staticmethod
    def resolve_subject_block_label(obj):
        return obj.subject_block.label if obj.subject_block else None


class SubjectPatchIn(Schema):
    start_date: datetime.date | None = None
    due_date: datetime.date | None = None
    block_count: int | None = None
    group_id: int | None = None
    order_index: int | None = None
    attestation_type: str | None = None


class TopicOrderIn(Schema):
    id: int
    order_index: int


class TopicsReorderIn(Schema):
    items: list[TopicOrderIn]


class SubjectOrderIn(Schema):
    id: int
    order_index: int
    group_id: int | None = None


class SubjectsReorderIn(Schema):
    items: list[SubjectOrderIn]


class SubjectGroupOrderIn(Schema):
    id: int
    order_index: int


class SubjectGroupsReorderIn(Schema):
    items: list[SubjectGroupOrderIn]


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
    group_id: int | None = None
    order_index: int = 0
    attestation_type: str = 'none'


class TopicIn(Schema):
    subject_id: int
    title: str
    description: str = ''
    order_index: int
