"""Thumbnails for the icons of subject groups, subjects and lessons.

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
# draws it at, for retina screens. A group's icon is a 48px filter pill
# (subjects-shelf.tsx); a subject's is a book cover (up to ~144px, enlarged to
# ~290px on hover) and a lesson's a card picture (up to ~320px, see
# preschool-lesson-tile.tsx). Smaller originals are never scaled up.
SUBJECT_GROUP_ICON_SIDE = 96
SUBJECT_ICON_SIDE = 320
LESSON_ICON_SIDE = 320

THUMBNAIL_QUALITY = 85


def icon_thumbnail_field(side: int) -> ImageSpecField:
    """The `icon_thumbnail` field of a model whose image field is `icon`."""
    return ImageSpecField(
        source='icon',
        processors=[ResizeToFit(side, side, upscale=False)],
        options={'quality': THUMBNAIL_QUALITY},
    )


def icon_url(instance, request) -> str | None:
    """Absolute URL of `instance`'s icon thumbnail, or None when it has no
    icon. Falls back to the original icon if the thumbnail can't be made (an
    SVG, a file that isn't really an image, one that has gone missing from
    storage) — showing the picture at full size beats failing the whole
    response. `request` may be None, which leaves the URL host-relative."""
    if not instance.icon:
        return None
    try:
        url = instance.icon_thumbnail.url
    except Exception as exc:  # noqa: BLE001 — whatever imagekit/Pillow/storage raise, the original still works
        logger.warning('No thumbnail for %r icon %s (%s); serving the original', instance, instance.icon.name, exc)
        url = instance.icon.url
    # File URLs are host-relative and the frontend is a separate origin (no BFF).
    return request.build_absolute_uri(url) if request is not None else url

