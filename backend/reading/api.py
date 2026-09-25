import zipfile

from django.db import transaction
from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from ninja import File, Form, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile

from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import ensure_is_tutor
from lessons.models import QuizLanguage

from . import services
from .models import Syllable
from .schemas import SyllableImportResultOut, SyllableOut, SyllablePatchIn

# Router-level auth defaults to tutor-only (CookieOrBearerJWTAuth) — the two
# public read endpoints below override it to auth=None, since every /games
# route is reachable signed out (see docs/core/public_access.md, frontend's
# middleware.ts PUBLIC_PATHS). Every other endpoint lives under /tutor/... —
# the /tutor/syllables page's editing surface.
router = Router(tags=['reading'], auth=CookieOrBearerJWTAuth())


@router.get('/syllables', response=list[SyllableOut], auth=None, operation_id='list_reading_syllables')
def list_syllables(
    request: HttpRequest,
    consonant: str | None = None,
    is_default: bool | None = None,
    language: QuizLanguage | None = None,
):
    """Every Syllable card — backs the "Картки" (cards-game.tsx) and "Казки"
    (stories-game.tsx, via lib/syllable-card.tsx) reading games. `consonant`
    filters to one first_letter (a "Картки" level); `is_default=true` is
    the single representative card per syllable those games fall back to
    (a Learning-mode grid slot, or a Stories/Jumping-Frogs inline card).
    `language` narrows to one language's cards (the "Склади" game's
    language setting)."""
    qs = Syllable.objects.all()
    if language:
        qs = qs.filter(language=language)
    if consonant:
        qs = qs.filter(first_letter=consonant.upper())
    if is_default is not None:
        qs = qs.filter(is_default=is_default)
    return qs


@router.get('/consonants', response=list[str], auth=None, operation_id='list_reading_consonants')
def list_consonants(request: HttpRequest, language: QuizLanguage | None = None):
    """Every first_letter with at least one Syllable card — the "Картки"
    game's consonant picker (replaces the old GET /api/cards-game-modes'
    public/static/syllables folder scan). `language` narrows it to one
    language's cards (the "Склади" game's language setting)."""
    qs = Syllable.objects.all()
    if language:
        qs = qs.filter(language=language)
    return list(qs.order_by('first_letter').values_list('first_letter', flat=True).distinct())


@router.get('/tutor/syllables', response=list[SyllableOut], operation_id='list_tutor_reading_syllables')
def list_tutor_syllables(request: HttpRequest):
    """Every Syllable row, for the /tutor/syllables table — unlike
    list_syllables above this has no filters, since the tutor page shows
    everything at once."""
    ensure_is_tutor(request)
    return Syllable.objects.all()


@router.post('/tutor/syllables/{syllable_id}/set-default', response=SyllableOut, operation_id='set_default_reading_syllable')
def set_default_syllable(request: HttpRequest, syllable_id: int):
    """Flags this Syllable as the is_default card for its (language,
    first_letter, second_part) group — the /tutor/syllables table's
    "Основна" action. Whichever other row in the same group currently
    holds that flag (if any) loses it in the same transaction, since only
    one row per group may have it (see Syllable.Meta's constraint)."""
    require_csrf(request)
    ensure_is_tutor(request)
    syllable = get_object_or_404(Syllable, id=syllable_id)
    with transaction.atomic():
        Syllable.objects.filter(
            language=syllable.language,
            first_letter=syllable.first_letter,
            second_part=syllable.second_part,
            is_default=True,
        ).exclude(id=syllable.id).update(is_default=False)
        syllable.is_default = True
        syllable.save(update_fields=['is_default'])
    return syllable


@router.patch('/tutor/syllables/{int:syllable_id}', response=SyllableOut, operation_id='update_tutor_reading_syllable')
def update_syllable(request: HttpRequest, syllable_id: int, payload: SyllablePatchIn):
    """The /tutor/syllables table's inline edit of a card's syllable
    (first_letter + second_part), word and language. Letters are stored
    uppercase, word keeps the tutor's casing. Moving a card to another
    (language, first_letter, second_part) group keeps Syllable.Meta's
    one-default-per-group constraint: the card becomes its new group's
    default only if that group has none, and when it was its old group's
    default another card there (if any) takes over."""
    require_csrf(request)
    ensure_is_tutor(request)
    syllable = get_object_or_404(Syllable, id=syllable_id)
    changes = payload.dict(exclude_unset=True)

    for field in ('first_letter', 'second_part'):
        if field in changes:
            value = (changes[field] or '').strip().upper()
            # second_part may be empty — a card for a word starting with a vowel.
            min_length = 1 if field == 'first_letter' else 0
            if not min_length <= len(value) <= Syllable._meta.get_field(field).max_length:
                raise HttpError(400, f'{field} must be {min_length}-4 characters')
            changes[field] = value
    if 'word' in changes:
        word = (changes['word'] or '').strip()
        if not word or len(word) > Syllable._meta.get_field('word').max_length:
            raise HttpError(400, 'word must be 1-64 characters')
        changes['word'] = word
    if 'language' in changes and changes['language'] is None:
        raise HttpError(400, 'language must not be empty')

    old_group = (syllable.language, syllable.first_letter, syllable.second_part)
    for field, value in changes.items():
        setattr(syllable, field, value)
    new_group = (syllable.language, syllable.first_letter, syllable.second_part)

    with transaction.atomic():
        if new_group != old_group:
            was_default = syllable.is_default
            syllable.is_default = not services.group_has_default(*new_group)
            syllable.save()
            if was_default:
                language, first_letter, second_part = old_group
                heir = Syllable.objects.filter(
                    language=language, first_letter=first_letter, second_part=second_part
                ).first()
                if heir:
                    heir.is_default = True
                    heir.save(update_fields=['is_default'])
        else:
            syllable.save()
    return syllable


@router.post(
    '/tutor/syllables/import',
    response=SyllableImportResultOut,
    operation_id='import_tutor_reading_syllables',
)
def import_tutor_syllables(
    request: HttpRequest, file: UploadedFile = File(...), language: QuizLanguage = Form(QuizLanguage.UK)
):
    """Imports Syllable rows from an uploaded ZIP shaped like the legacy
    public/static/syllables/<consonant>/{words.json,<syllable>.png} asset
    folder, or a single picture named after its word (`Баран.png`) — the
    /tutor/syllables page's "Import" button. See services.
    import_syllables_archive / import_syllable_image. `language` is what
    every imported row gets (the page's language picker, Ukrainian by
    default)."""
    require_csrf(request)
    ensure_is_tutor(request)
    is_zip = zipfile.is_zipfile(file)
    file.seek(0)
    try:
        if is_zip:
            summary = services.import_syllables_archive(file, language)
        else:
            summary = services.import_syllable_image(file, language)
    except (zipfile.BadZipFile, ValueError) as exc:
        raise HttpError(400, str(exc)) from exc
    return SyllableImportResultOut(created=summary.created, updated=summary.updated, skipped=summary.skipped)
