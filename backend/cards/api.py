import re

from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from ninja import Router
from ninja.errors import HttpError
from ninja.responses import Status

from academics.models import Subject, Topic
from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import ensure_is_owner_student, get_own_student_profile
from lessons.models import Lesson, StudentLesson

from . import services
from .models import StudentCard, StudentCustomLesson, StudentCustomTopic
from .schemas import (
    AddStudentCardIn,
    CardCategoryOut,
    CardGroupOut,
    CardSetOut,
    CardSetSummaryOut,
    ImportCardSetIn,
    ImportCardSetOut,
    StudentCardOut,
    UpdateStudentCardTranslationIn,
)

router = Router(tags=['cards'])

# Synthetic slugs for the Cards game's Group/Set structure — a card's
# "group" is always its (real) Subject (see models.py: every StudentCard/
# StudentCustomTopic is tied to one), numeric-id-based and prefixed so it
# can never collide with a static public/static/cards/<group> folder name
# (those are plain words like "spanish"/"math" — see frontend's
# lib/flashcard-types.ts). Within one Subject's group, a "set" is either a
# real Topic ("topic-<id>") or, for an import that didn't match one, a
# personal StudentCustomTopic ("custom-<id>") — both can appear side by
# side under the same subject-<id> group (see services.import_card_set).
GROUP_SLUG_RE = re.compile(r'^subject-(\d+)$')
SET_SLUG_RE = re.compile(r'^topic-(\d+)$')
CUSTOM_SET_SLUG_RE = re.compile(r'^custom-(\d+)$')


def _get_owned_student_lesson(request: HttpRequest, student_lesson_id: int) -> StudentLesson:
    student_lesson = get_object_or_404(StudentLesson.objects.select_related('lesson'), id=student_lesson_id)
    ensure_is_owner_student(request, student_lesson)
    return student_lesson


def _get_owned_card(request: HttpRequest, card_id: int) -> StudentCard:
    student = get_own_student_profile(request)
    card = get_object_or_404(StudentCard, id=card_id)
    if card.student_id != student.id:
        raise HttpError(403, 'Not the owner of this card')
    return card


def _get_owned_subject(subject_id: int, student) -> Subject:
    """Validates `subject_id` names a real Subject this student can access
    (by class, same rule academics.api.my_subjects uses) — not whether
    they've saved any cards there yet. The Subject page's own Cards tab
    always queries its own (possibly still-empty) subject directly, so "no
    cards yet" must come back as an empty list/set, not a 404."""
    subject = get_object_or_404(Subject, id=subject_id)
    if subject.school_class_id != student.school_class_id:
        raise HttpError(403, 'Not your subject')
    return subject


def _parse_subject_id(group_slug: str, student) -> int:
    match = GROUP_SLUG_RE.match(group_slug)
    if not match:
        raise HttpError(404, 'Unknown group')
    subject_id = int(match.group(1))
    _get_owned_subject(subject_id, student)
    return subject_id


def _parse_topic_id(set_slug: str, subject_id: int) -> int:
    """Validates the slug names a real Topic belonging to `subject_id` —
    same "structurally valid, possibly empty" reasoning as
    _get_owned_subject above."""
    match = SET_SLUG_RE.match(set_slug)
    if not match:
        raise HttpError(404, 'Unknown set')
    topic_id = int(match.group(1))
    if not Topic.objects.filter(id=topic_id, subject_id=subject_id).exists():
        raise HttpError(404, 'Unknown set')
    return topic_id


def _parse_custom_topic_id(set_slug: str, student, subject_id: int) -> int:
    """Validates the slug names a StudentCustomTopic owned by `student`
    under `subject_id` — same "structurally valid, possibly empty"
    reasoning as _get_owned_subject above."""
    match = CUSTOM_SET_SLUG_RE.match(set_slug)
    if not match:
        raise HttpError(404, 'Unknown set')
    topic_id = int(match.group(1))
    if not StudentCustomTopic.objects.filter(id=topic_id, student=student, subject_id=subject_id).exists():
        raise HttpError(404, 'Unknown set')
    return topic_id


@router.post('', response=StudentCardOut, auth=CookieOrBearerJWTAuth(), operation_id='add_student_card')
def add_card(request: HttpRequest, payload: AddStudentCardIn):
    """Saves a translated word/phrase as a personal flashcard — see the
    frontend's "Додати до карток" button, a sibling of dictionary's
    "Додати до словника"."""
    require_csrf(request)
    student_lesson = _get_owned_student_lesson(request, payload.student_lesson_id)
    return services.add_card(
        student_lesson, term=payload.term, translation=payload.translation, definition=payload.definition
    )


@router.post(
    '/import', response=ImportCardSetOut, auth=CookieOrBearerJWTAuth(), operation_id='import_student_card_set'
)
def import_card_set(request: HttpRequest, payload: ImportCardSetIn):
    """Imports a whole set.json-shaped deck (docs/preschool/games/
    cards.md) as personal flashcards under `payload.subject_id` — a real
    Subject the student picked (or was already viewing, on that Subject's
    own Картки tab), so the cards always show up there regardless of
    whether they matched real curriculum. See services.import_card_set for
    the topic/lesson matching rule (real curriculum when the titles match,
    otherwise a personal StudentCustomTopic under the same Subject)."""
    require_csrf(request)
    student = get_own_student_profile(request)
    if not payload.title.strip():
        raise HttpError(400, 'title must not be empty')
    if not payload.categories:
        raise HttpError(400, 'categories must not be empty')

    subject = _get_owned_subject(payload.subject_id, student)
    result = services.import_card_set(student, subject, payload)
    if result.topic_id is not None:
        set_slug = f'topic-{result.topic_id}'
        set_title = result.topic_title
    else:
        set_slug = f'custom-{result.custom_topic_id}'
        set_title = result.custom_topic_title
    return ImportCardSetOut(
        group_slug=f'subject-{subject.id}',
        group_title=subject.name,
        set_slug=set_slug,
        set_title=set_title,
        imported_count=result.imported_count,
    )


@router.patch(
    '/{card_id}/translation',
    response=StudentCardOut,
    auth=CookieOrBearerJWTAuth(),
    operation_id='update_student_card_translation',
)
def update_card_translation(request: HttpRequest, card_id: int, payload: UpdateStudentCardTranslationIn):
    """Lets the student correct/refine a saved card's translation inline —
    see the Subject page's Cards tab, same pattern as
    dictionary.api.update_dictionary_item_translation."""
    require_csrf(request)
    translation = payload.translation.strip()
    if not translation:
        raise HttpError(400, 'translation must not be empty')

    card = _get_owned_card(request, card_id)
    card.translation = translation
    card.save(update_fields=['translation'])
    return card


@router.get('/groups', response=list[CardGroupOut], auth=CookieOrBearerJWTAuth(), operation_id='list_my_card_groups')
def list_groups(request: HttpRequest):
    student = get_own_student_profile(request)
    real_subject_ids = StudentCard.objects.filter(student=student, lesson__isnull=False).values_list(
        'lesson__topic__subject_id', flat=True
    )
    custom_subject_ids = StudentCustomTopic.objects.filter(
        student=student, lessons__student_cards__isnull=False
    ).values_list('subject_id', flat=True)
    subjects = Subject.objects.filter(id__in=set(real_subject_ids) | set(custom_subject_ids))
    return [CardGroupOut(slug=f'subject-{subject.id}', title=subject.name) for subject in subjects]


@router.get(
    '/groups/{group_slug}/sets',
    response=list[CardSetSummaryOut],
    auth=CookieOrBearerJWTAuth(),
    operation_id='list_my_card_sets',
)
def list_sets(request: HttpRequest, group_slug: str):
    student = get_own_student_profile(request)
    subject_id = _parse_subject_id(group_slug, student)

    topic_ids = (
        StudentCard.objects.filter(student=student, lesson__topic__subject_id=subject_id)
        .values_list('lesson__topic_id', flat=True)
        .distinct()
    )
    result = []
    for topic in Topic.objects.filter(id__in=topic_ids):
        cards = StudentCard.objects.filter(student=student, lesson__topic_id=topic.id)
        result.append(
            CardSetSummaryOut(
                slug=f'topic-{topic.id}',
                title=topic.title,
                category_count=cards.values('lesson_id').distinct().count(),
                item_count=cards.count(),
            )
        )

    custom_topics = StudentCustomTopic.objects.filter(
        student=student, subject_id=subject_id, lessons__student_cards__isnull=False
    ).distinct()
    for custom_topic in custom_topics:
        cards = StudentCard.objects.filter(student=student, custom_lesson__topic_id=custom_topic.id)
        result.append(
            CardSetSummaryOut(
                slug=f'custom-{custom_topic.id}',
                title=custom_topic.title,
                category_count=cards.values('custom_lesson_id').distinct().count(),
                item_count=cards.count(),
            )
        )
    return result


@router.get(
    '/groups/{group_slug}/sets/{set_slug}',
    response=CardSetOut,
    auth=CookieOrBearerJWTAuth(),
    operation_id='get_my_card_set',
)
def get_set(request: HttpRequest, group_slug: str, set_slug: str):
    student = get_own_student_profile(request)
    subject_id = _parse_subject_id(group_slug, student)

    if set_slug.startswith('custom-'):
        custom_topic_id = _parse_custom_topic_id(set_slug, student, subject_id)
        custom_topic = get_object_or_404(StudentCustomTopic, id=custom_topic_id)
        custom_lessons = (
            StudentCustomLesson.objects.filter(topic_id=custom_topic_id, student_cards__student=student)
            .distinct()
            .order_by('order_index')
        )
        categories = [
            CardCategoryOut(
                title=custom_lesson.title,
                items=list(
                    StudentCard.objects.filter(student=student, custom_lesson=custom_lesson).order_by(
                        'order_index', 'created_at'
                    )
                ),
            )
            for custom_lesson in custom_lessons
        ]
        return CardSetOut(title=custom_topic.title, categories=categories)

    topic_id = _parse_topic_id(set_slug, subject_id)
    topic = get_object_or_404(Topic, id=topic_id)

    lessons = (
        Lesson.objects.filter(topic_id=topic_id, student_cards__student=student)
        .distinct()
        .order_by('order_index')
    )
    categories = [
        CardCategoryOut(
            title=lesson.title,
            items=list(StudentCard.objects.filter(student=student, lesson=lesson).order_by('order_index', 'created_at')),
        )
        for lesson in lessons
    ]
    return CardSetOut(title=topic.title, categories=categories)


# Registered after the static /groups... routes above — Ninja's test client
# matches path templates by segment shape without checking the {card_id}
# converter's int type, so a single-segment GET like "/groups" would
# otherwise false-positive-match this DELETE route first (wrong method,
# 405) before ever trying the real "/groups" route. Django's real URL
# resolver doesn't have this ambiguity (its <int:card_id> converter
# correctly rejects non-numeric segments), but registering the specific
# routes first avoids relying on that distinction.
@router.delete('/{card_id}', response={204: None}, auth=CookieOrBearerJWTAuth(), operation_id='delete_student_card')
def delete_card(request: HttpRequest, card_id: int):
    require_csrf(request)
    _get_owned_card(request, card_id).delete()
    return Status(204, None)
