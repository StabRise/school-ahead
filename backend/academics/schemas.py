import datetime

from ninja import Schema


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
    name: str
    description: str
    recommended_resources: str
    block_count: int
    start_date: datetime.date
    due_date: datetime.date
    blocks: list[SubjectBlockOut]

    @staticmethod
    def resolve_blocks(obj):
        return list(obj.blocks.all())


class TopicOut(Schema):
    id: int
    subject_id: int
    title: str
    description: str
    order_index: int
    lesson_count: int
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


class SubjectIn(Schema):
    school_class_id: int
    name: str
    description: str = ''
    recommended_resources: str = ''
    block_count: int = 2
    start_date: datetime.date | None = None
    due_date: datetime.date | None = None


class TopicIn(Schema):
    subject_id: int
    title: str
    description: str = ''
    order_index: int
