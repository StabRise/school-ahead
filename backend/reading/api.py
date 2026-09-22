from django.http import HttpRequest
from ninja import Router

from .models import Syllable
from .schemas import SyllableOut

# Entirely public (auth=None) — every /games route is reachable signed out
# (see docs/core/public_access.md, frontend's middleware.ts PUBLIC_PATHS),
# and there's no tutor-facing editing surface for Syllable yet (content is
# seeded via reading.management.commands.import_reading_syllables).
router = Router(tags=['reading'], auth=None)


@router.get('/syllables', response=list[SyllableOut], operation_id='list_reading_syllables')
def list_syllables(request: HttpRequest, consonant: str | None = None, is_default: bool | None = None):
    """Every Syllable card — backs the "Картки" (cards-game.tsx) and "Казки"
    (stories-game.tsx, via lib/syllable-card.tsx) reading games. `consonant`
    filters to one first_letter (a "Картки" level); `is_default=true` is
    the single representative card per syllable those games fall back to
    (a Learning-mode grid slot, or a Stories/Jumping-Frogs inline card)."""
    qs = Syllable.objects.all()
    if consonant:
        qs = qs.filter(first_letter=consonant.upper())
    if is_default is not None:
        qs = qs.filter(is_default=is_default)
    return qs


@router.get('/consonants', response=list[str], operation_id='list_reading_consonants')
def list_consonants(request: HttpRequest):
    """Every first_letter with at least one Syllable card — the "Картки"
    game's consonant picker (replaces the old GET /api/cards-game-modes'
    public/static/syllables folder scan)."""
    return list(Syllable.objects.order_by('first_letter').values_list('first_letter', flat=True).distinct())
