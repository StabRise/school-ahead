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


class ImportCardItemIn(Schema):
    term: str
    translation: str = ''
    definition: str = ''


class ImportCardCategoryIn(Schema):
    """One set.json category (docs/preschool/games/cards.md) — matched
    against a real Lesson's title, or filed under a StudentCustomLesson of
    the same title otherwise. See services.import_card_set."""

    title: str
    items: list[ImportCardItemIn]


class ImportCardSetIn(Schema):
    """The set.json shape a student can import as personal flashcards
    (frontend's "load set from json file" button), plus which real Subject
    it belongs to (`subject_id` — not part of set.json itself, since one
    set.json only ever names its own topic/lesson titles, and picking a
    real Subject id rather than typing a name guarantees the cards always
    show up under that Subject's own Картки tab, never somewhere else).
    `title` is matched against a real Topic under that Subject, then each
    category's title against a real Lesson under that Topic; falling back
    to a personal StudentCustomTopic (still tied to the same real Subject)
    of the same names the moment either doesn't match. See
    services.import_card_set."""

    subject_id: int
    title: str
    categories: list[ImportCardCategoryIn]


class ImportCardSetOut(Schema):
    """Where the imported cards ended up — lets the frontend jump straight
    to that group/set page, and say its name (e.g. "«Фізика» →
    «1. Wprowadzenie»") rather than just a raw slug."""

    group_slug: str
    group_title: str
    set_slug: str
    set_title: str
    imported_count: int
