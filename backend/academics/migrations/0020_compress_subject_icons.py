"""Shrinks the icons already uploaded for subjects and subject groups.

They were uploaded as-is — often multi-megabyte, 2000px-wide pictures — but
are only ever shown as small squares (a book cover, a filter button, a title
badge), so every page that lists them was downloading far more than it
draws. Each image larger than MAX_SIDE is scaled down to fit, keeping its
proportions and format (JPEG/PNG/WebP), and the smaller file replaces the
original — only if it really is smaller. Anything that can't be read as an
image (missing file, SVG, animated WebP, ...) is left exactly as it is.

Self-contained on purpose (no imports from the app's own code) so this
migration keeps working however the app changes later. Not reversible: the
original pixels are gone, so reversing is a no-op.
"""

import io
import logging
import posixpath

from django.core.files.base import ContentFile
from django.db import migrations

logger = logging.getLogger(__name__)

# The largest icon on screen is ~130px, twice that for retina — 512px keeps
# generous headroom (e.g. for a future larger card) without the bulk.
MAX_SIDE = 512
JPEG_QUALITY = 85
WEBP_QUALITY = 85


def _compressed(data: bytes) -> bytes | None:
    """`data` shrunk to fit MAX_SIDE and re-encoded in its own format, or None
    when it isn't an image we handle or the result wouldn't be smaller."""
    from PIL import Image, ImageOps, UnidentifiedImageError

    try:
        image = Image.open(io.BytesIO(data))
        image_format = image.format
        if image_format not in ('JPEG', 'PNG', 'WEBP') or getattr(image, 'is_animated', False):
            return None
        image.load()
    except (UnidentifiedImageError, OSError, ValueError):
        return None

    # Saving drops EXIF, so bake a camera's rotation into the pixels first.
    image = ImageOps.exif_transpose(image)
    image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)

    out = io.BytesIO()
    if image_format == 'JPEG':
        image.convert('RGB').save(out, 'JPEG', quality=JPEG_QUALITY, optimize=True, progressive=True)
    elif image_format == 'PNG':
        image.save(out, 'PNG', optimize=True)
    else:
        image.save(out, 'WEBP', quality=WEBP_QUALITY)

    result = out.getvalue()
    return result if len(result) < len(data) else None


def _compress_model_icons(model) -> tuple[int, int, int]:
    """(compressed, bytes_before, bytes_after) for every row's `icon`."""
    field = model._meta.get_field('icon')
    storage = field.storage
    compressed = bytes_before = bytes_after = 0

    for instance in model.objects.exclude(icon=''):
        old_name = instance.icon.name
        try:
            with storage.open(old_name, 'rb') as stored:
                data = stored.read()
        except Exception:  # noqa: BLE001 — missing file, or any storage backend's own error type
            logger.warning('Skipping %s #%s icon %r: could not be read', model.__name__, instance.pk, old_name)
            continue

        smaller = _compressed(data)
        if smaller is None:
            continue

        # Same upload_to directory and extension as the original, fresh unique
        # name. Save the new file and point the row at it *before* deleting the
        # old one, so an interruption never leaves a row without its file.
        new_name = storage.save(
            field.generate_filename(instance, posixpath.basename(old_name)), ContentFile(smaller)
        )
        model.objects.filter(pk=instance.pk).update(icon=new_name)
        try:
            storage.delete(old_name)
        except Exception:  # noqa: BLE001
            logger.warning('Could not delete the old icon file %r', old_name)

        compressed += 1
        bytes_before += len(data)
        bytes_after += len(smaller)
    return compressed, bytes_before, bytes_after


def compress_icons(apps, schema_editor):
    for model_name in ('Subject', 'SubjectGroup'):
        compressed, before, after = _compress_model_icons(apps.get_model('academics', model_name))
        if compressed:
            logger.info(
                'Compressed %s %s icon(s): %.1f MB -> %.1f MB', compressed, model_name, before / 1e6, after / 1e6
            )
            print(f'  Compressed {compressed} {model_name} icon(s): {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB')


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0019_subjectgroup_icon'),
    ]

    operations = [
        migrations.RunPython(compress_icons, migrations.RunPython.noop),
    ]
