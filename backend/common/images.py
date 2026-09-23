"""Thumbnails for the icons of subject groups, subjects, lessons and reading
syllables, and for story covers and story image assets.

An icon is uploaded (or, for a lesson, downloaded from YouTube) at whatever size
it came in — often far larger than the ~50-300px square it is drawn in. Every
model with an icon therefore also has an `icon_thumbnail`: an imagekit spec
that scales the icon down, keeping its proportions and its format (a
transparent PNG stays a transparent PNG). imagekit makes the file the first
time its URL is asked for and reuses it after, so nothing has to be backfilled
for icons that already exist.

The API sends the thumbnail wherever it used to send the icon (`icon_url`), so
the field keeps its name and the frontend needs no change.
"""

import logging

from imagekit.models import ImageSpecField
from pilkit.processors import ResizeToFit

logger = logging.getLogger(__name__)

# Longest side, in px, of each icon's thumbnail — about twice what the frontend
# draws it at, for retina screens. A group's icon is an 88px filter pill
# (subjects-shelf.tsx); a subject's is a book cover (up to ~144px, enlarged to
# ~290px on hover) and a lesson's a card picture (up to ~320px, see
# preschool-lesson-tile.tsx). Smaller originals are never scaled up.
SUBJECT_GROUP_ICON_SIDE = 176
SUBJECT_ICON_SIDE = 320
LESSON_ICON_SIDE = 320
# A syllable's picture card, drawn small in the card's bottom-right corner
# (reading-game.tsx) — same order of magnitude as a lesson card picture.
SYLLABLE_ICON_SIDE = 320
# A story's cover is drawn as a picker book (story-book.tsx, ~200-260px wide)
# and the editor's cover preview; a story asset's thumbnail is the editor
# sidebar's 40px preview (enlarged 3x on hover) — see preschool/models.py.
STORY_COVER_SIDE = 640
STORY_ASSET_THUMBNAIL_SIDE = 320

THUMBNAIL_QUALITY = 85


def thumbnail_field(source: str, side: int) -> ImageSpecField:
    """A thumbnail spec of the model's `source` image field, scaled down to
    at most `side` px on its longest side."""
    return ImageSpecField(
        source=source,
        processors=[ResizeToFit(side, side, upscale=False)],
        options={'quality': THUMBNAIL_QUALITY},
    )


def icon_thumbnail_field(side: int) -> ImageSpecField:
    """The `icon_thumbnail` field of a model whose image field is `icon`."""
    return thumbnail_field('icon', side)


def thumbnail_url(original, thumbnail, request) -> str | None:
    """Absolute URL of `thumbnail` (an ImageSpecField value), or None when
    `original` (its source file) is empty. Falls back to the original file
    if the thumbnail can't be made (an SVG, a file that isn't really an
    image, one that has gone missing from storage) — showing the picture at
    full size beats failing the whole response. `request` may be None,
    which leaves the URL host-relative."""
    if not original:
        return None
    try:
        url = thumbnail.url
    except Exception as exc:  # noqa: BLE001 — whatever imagekit/Pillow/storage raise, the original still works
        logger.warning('No thumbnail for %s (%s); serving the original', original.name, exc)
        url = original.url
    # File URLs are host-relative and the frontend is a separate origin (no BFF).
    return request.build_absolute_uri(url) if request is not None else url


def icon_url(instance, request) -> str | None:
    """Absolute URL of `instance`'s icon thumbnail, or None when it has no
    icon — see thumbnail_url."""
    return thumbnail_url(instance.icon, instance.icon_thumbnail, request)
