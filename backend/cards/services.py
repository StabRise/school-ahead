from dataclasses import dataclass

from academics.models import Subject, Topic
from accounts.models import StudentProfile
from lessons.models import Lesson, StudentLesson

from .models import StudentCard, StudentCustomLesson, StudentCustomTopic
from .schemas import ImportCardCategoryIn, ImportCardItemIn, ImportCardSetIn


def add_card(student_lesson: StudentLesson, *, term: str, translation: str, definition: str = '') -> StudentCard:
    """Saves a translated word/phrase from `student_lesson` as a personal
    flashcard, appended after any existing cards for the same (student,
    lesson) pair — same .count()-based order_index pattern as
    lessons/services.py::add_material."""
    lesson = student_lesson.lesson
    order_index = StudentCard.objects.filter(student=student_lesson.student, lesson=lesson).count()
    return StudentCard.objects.create(
        student=student_lesson.student,
        lesson=lesson,
        term=term,
        translation=translation,
        definition=definition,
        order_index=order_index,
    )


@dataclass
class CardSetImportResult:
    imported_count: int = 0
    # Exactly one of these two is set: `topic_id` when `payload.title` and
    # every category's title matched a real curriculum Topic/Lesson under
    # `subject` — the cards were attached there directly, nothing custom
    # was created. `custom_topic_id` otherwise — the entire set was filed
    # under a StudentCustomTopic instead, still tied to the same `subject`.
    topic_id: int | None = None
    topic_title: str = ''
    custom_topic_id: int | None = None
    custom_topic_title: str = ''


def _find_real_lessons(topic: Topic, categories: list[ImportCardCategoryIn]) -> dict[str, Lesson] | None:
    """Every category's title matched to a real Lesson under `topic`, or
    `None` the moment any one of them doesn't — import_card_set then falls
    back to a personal StudentCustomTopic for the *whole* set rather than
    splitting it across a real Topic and a personal one."""
    lessons: dict[str, Lesson] = {}
    for category in categories:
        lesson = Lesson.objects.filter(topic=topic, title__iexact=category.title).first()
        if lesson is None:
            return None
        lessons[category.title] = lesson
    return lessons


def _append_cards(*, student: StudentProfile, lesson_filter: dict, items: list[ImportCardItemIn]) -> int:
    existing_count = StudentCard.objects.filter(student=student, **lesson_filter).count()
    cards = [
        StudentCard(
            student=student,
            term=item.term,
            translation=item.translation,
            definition=item.definition,
            order_index=existing_count + offset,
            **lesson_filter,
        )
        for offset, item in enumerate(items)
    ]
    StudentCard.objects.bulk_create(cards)
    return len(cards)


def import_card_set(student: StudentProfile, subject: Subject, payload: ImportCardSetIn) -> CardSetImportResult:
    """Imports a whole set.json-shaped deck as personal flashcards under
    `subject` — a real curriculum Subject the caller (cards/api.py's
    import_card_set) already validated belongs to the student's class, so
    the cards always end up on that Subject's own Картки tab regardless of
    whether they matched real curriculum. `payload.title` is matched
    (case-insensitively) against a real Topic under `subject`; if it
    matches AND every category's title also matches a real Lesson under
    that Topic, every card is attached to its real Lesson — same
    Group/Set/Category slot a lesson-sourced card would land in
    (cards/api.py's subject-<id>/topic-<id>). Otherwise (no matching Topic,
    or a partial lesson match), the *entire* set is instead filed under a
    StudentCustomTopic of the same title under the same `subject`
    (get-or-created, so re-importing the same file merges into it rather
    than duplicating) — deliberately never split across a real Topic and a
    personal one, so a student always finds a whole import in exactly one
    place (subject-<id>/custom-<id> instead). Never creates a real
    Topic/Lesson: those stay tutor/admin-authored curriculum content (see
    lessons.services.import_topics_and_lessons for that, unrelated,
    tutor-facing flow)."""
    real_topic = Topic.objects.filter(subject=subject, title__iexact=payload.title).first()
    real_lessons = _find_real_lessons(real_topic, payload.categories) if real_topic else None

    result = CardSetImportResult()

    if real_topic is not None and real_lessons is not None:
        for category in payload.categories:
            result.imported_count += _append_cards(
                student=student, lesson_filter={'lesson': real_lessons[category.title]}, items=category.items
            )
        result.topic_id = real_topic.id
        result.topic_title = real_topic.title
        return result

    custom_topic, _created = StudentCustomTopic.objects.get_or_create(
        student=student, subject=subject, title=payload.title
    )
    next_order = custom_topic.lessons.count()
    for category in payload.categories:
        custom_lesson, created = StudentCustomLesson.objects.get_or_create(
            topic=custom_topic, title=category.title, defaults={'order_index': next_order}
        )
        if created:
            next_order += 1
        result.imported_count += _append_cards(
            student=student, lesson_filter={'custom_lesson': custom_lesson}, items=category.items
        )
    result.custom_topic_id = custom_topic.id
    result.custom_topic_title = custom_topic.title
    return result
