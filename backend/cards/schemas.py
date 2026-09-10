from ninja import Schema


class AddStudentCardIn(Schema):
    student_lesson_id: int
    term: str
    translation: str
    definition: str = ''


class StudentCardOut(Schema):
    id: int
    term: str
    translation: str
    definition: str


class UpdateStudentCardTranslationIn(Schema):
    translation: str


class CardGroupOut(Schema):
    """One Subject with at least one saved card — a "group" in the Cards
    game's Group/Set/Category structure."""

    slug: str
    title: str


class CardSetSummaryOut(Schema):
    """One Topic (within a group's Subject) with at least one saved card —
    a "set" summary, listed before its full content is fetched."""

    slug: str
    title: str
    category_count: int
    item_count: int


class CardCategoryOut(Schema):
    """One Lesson (within a set's Topic) with at least one saved card — a
    "category" holding that lesson's items."""

    title: str
    items: list[StudentCardOut]


class CardSetOut(Schema):
    title: str
    categories: list[CardCategoryOut]
