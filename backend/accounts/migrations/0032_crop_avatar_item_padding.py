# AvatarItem SVGs are authored on a per-avatar canvas much larger than the
# actual drawn shape (see docs/core/avatar.md section 2.2) — a headwear/
# accessory item might only occupy a small region of its own viewBox, which
# makes it look tiny wherever it's rendered plain (the wardrobe picker's
# thumbnail buttons use the image as-is, with no offset_x/offset_y/scale
# applied at all).
#
# This crops each item's viewBox down to its drawn content (plus a small
# margin), which fixes those plain thumbnails directly. The equipped-on-
# avatar rendering (AvatarPreview/EquippedAvatarLayers) DOES apply offset_x/
# offset_y/scale on top via object-contain + CSS transform, so cropping
# would otherwise shift/rescale every equipped item's position — this
# migration counteracts that automatically. The crop is padded back out to
# the item's *original* aspect ratio (never changing it), which keeps
# object-contain's own auto-fit scale identical before and after (the
# dominant axis of an object-contain image always fills its container
# edge-to-edge, regardless of the image's absolute size, as long as the
# aspect ratio doesn't change) — so `scale` never needs adjusting, only
# `offset_x`/`offset_y`, to re-center on the same visual point as before
# (object-contain always maps an image's own center to its container's
# center, so only a re-centering delta is needed, not a full recomputation).
# See the module-level comment on `_offset_delta` below for the exact
# derivation.
#
# Only the root <svg>'s viewBox/width/height attributes change — no path,
# shape, or transform data is touched, so the artwork itself is identical,
# just viewed through a tighter window.
#
# Not reversible: the original full-canvas viewBox size isn't recoverable
# from the cropped file alone. Back up backend/media/avatar_items/ first if
# you need to undo this locally; in a deployed environment, restore the
# affected AvatarItem.image files (and offset_x/offset_y, and any
# EquippedItemPlacement rows for those items) from a database/storage
# backup taken before this migration ran.

import re
from io import BytesIO

from django.db import migrations

# How much of the tight content bounding box's own size to add as breathing
# room on every side before padding out to the original aspect ratio — a
# crop landing exactly on a path's edge would look clipped for any anti-
# aliasing/stroke-width the geometric bbox doesn't account for.
MARGIN_RATIO = 0.08

# Skip items where cropping wouldn't remove much padding anyway (the
# computed crop is already within this fraction of the full canvas on both
# axes) — not worth the offset_x/offset_y churn for a negligible visual
# change, e.g. most clothing items which already cover most of the canvas.
SKIP_IF_CROP_COVERS_AT_LEAST = 0.92


def _fmt(value: float) -> str:
    return f'{value:.4f}'.rstrip('0').rstrip('.')


def _content_bbox(svg):
    """Tight bounding box (x0, y0, x1, y1) of every drawn shape in `svg`
    (an svgelements.SVG), in the document's own viewBox coordinate space,
    or None if it has no shapes with a computable bbox."""
    bbox = None
    for element in svg.elements():
        get_bbox = getattr(element, 'bbox', None)
        if get_bbox is None or element is svg:
            continue
        try:
            shape_bbox = get_bbox()
        except Exception:
            continue
        if shape_bbox is None:
            continue
        x0, y0, x1, y1 = shape_bbox
        if bbox is None:
            bbox = [x0, y0, x1, y1]
        else:
            bbox[0] = min(bbox[0], x0)
            bbox[1] = min(bbox[1], y0)
            bbox[2] = max(bbox[2], x1)
            bbox[3] = max(bbox[3], y1)
    return tuple(bbox) if bbox is not None else None


def _padded_crop_box(bbox, canvas_w, canvas_h):
    """The smallest window of the *same aspect ratio as the full canvas*
    that contains `bbox` plus MARGIN_RATIO breathing room, clamped to stay
    within [0, canvas_w] x [0, canvas_h] (shifted rather than resized if the
    naive centered window would spill past an edge — a corner-anchored
    item, e.g. a hat drawn near the top of its canvas, has nowhere further
    up to pad into). Returns (x, y, w, h) or None if no crop is worth
    applying (see SKIP_IF_CROP_COVERS_AT_LEAST)."""
    x0, y0, x1, y1 = bbox
    bw, bh = x1 - x0, y1 - y0
    if bw <= 0 or bh <= 0:
        return None
    margin = MARGIN_RATIO * max(bw, bh)
    x0, y0, x1, y1 = x0 - margin, y0 - margin, x1 + margin, y1 + margin
    x0, y0 = max(x0, 0), max(y0, 0)
    x1, y1 = min(x1, canvas_w), min(y1, canvas_h)
    bw, bh = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2

    aspect = canvas_w / canvas_h
    crop_w = max(bw, bh * aspect)
    crop_h = crop_w / aspect

    if crop_w >= SKIP_IF_CROP_COVERS_AT_LEAST * canvas_w and crop_h >= SKIP_IF_CROP_COVERS_AT_LEAST * canvas_h:
        return None

    crop_x = cx - crop_w / 2
    crop_x = max(0.0, min(crop_x, canvas_w - crop_w))
    crop_y = cy - crop_h / 2
    crop_y = max(0.0, min(crop_y, canvas_h - crop_h))
    return crop_x, crop_y, crop_w, crop_h


def _offset_delta(crop_box, canvas_w, canvas_h):
    """How much to ADD to an existing offset_x/offset_y (percent, see
    AvatarItem.offset_x/offset_y) so an image cropped to `crop_box` still
    renders at the same on-screen position it did at the full canvas size.

    object-contain always maps an image's own center point to its
    container's center. Before the crop, the point that will become the
    new image's center (crop_box's own center, in original-canvas
    coordinates) rendered at container-fraction `before` (computed via the
    standard object-contain fit formula, scale = 1/max(W,H) in a unit
    container — this holds regardless of the container's own aspect ratio,
    since only the *fraction* of the dominant axis matters, and every
    AvatarBadge/EquippedAvatarLayers frame in the frontend uses a square
    (aspect-square) container). After the crop it renders at exactly
    (0.5, 0.5) instead (same center-mapping property) — the delta between
    the two, in percent, is the correction. Only offset needs correcting:
    since the crop preserves the canvas's own aspect ratio, the dominant
    (fully-filling) axis is the same axis before and after, and object-
    contain always scales that axis to exactly fill the container
    regardless of the image's absolute size — so `scale` never changes."""
    crop_x, crop_y, crop_w, crop_h = crop_box
    ccx, ccy = crop_x + crop_w / 2, crop_y + crop_h / 2
    s = 1 / max(canvas_w, canvas_h)
    margin_x = (1 - canvas_w * s) / 2
    margin_y = (1 - canvas_h * s) / 2
    before_x = margin_x + ccx * s
    before_y = margin_y + ccy * s
    return (before_x - 0.5) * 100, (before_y - 0.5) * 100


def _set_or_insert_attr(tag, attr, value):
    """Replaces `attr="..."` on the root <svg> tag if present, or inserts
    it right after `<svg` if not — some item SVGs declare only width/height
    with no explicit viewBox (SVG's implicit viewBox in that case is
    `0 0 width height`, but svgelements doesn't synthesize one, so this
    migration has to add it explicitly for those files)."""
    pattern = re.compile(rf'\b{attr}="[^"]*"')
    if pattern.search(tag):
        return pattern.sub(f'{attr}="{value}"', tag)
    return re.sub(r'^<svg\b', f'<svg {attr}="{value}"', tag, count=1)


def _rewrite_root_box(svg_text, x, y, w, h):
    """Replaces the root <svg> tag's viewBox/width/height with the given
    crop window — the only part of the file this migration touches; every
    path/shape/transform is left byte-for-byte as authored."""
    match = re.search(r'<svg\b[^>]*>', svg_text)
    if not match:
        return None
    tag = match.group(0)
    view_box = f'{_fmt(x)} {_fmt(y)} {_fmt(w)} {_fmt(h)}'
    tag = _set_or_insert_attr(tag, 'viewBox', view_box)
    tag = _set_or_insert_attr(tag, 'width', _fmt(w))
    tag = _set_or_insert_attr(tag, 'height', _fmt(h))
    return svg_text[: match.start()] + tag + svg_text[match.end() :]


def crop_padding(apps, schema_editor):
    from svgelements import SVG

    AvatarItem = apps.get_model('accounts', 'AvatarItem')
    EquippedItemPlacement = apps.get_model('accounts', 'EquippedItemPlacement')

    for item in AvatarItem.objects.all():
        if not item.image:
            continue
        item.image.open('rb')
        try:
            original_bytes = item.image.read()
        finally:
            item.image.close()
        if not original_bytes:
            continue

        try:
            svg_text = original_bytes.decode('utf-8')
        except UnicodeDecodeError:
            continue

        try:
            svg = SVG.parse(BytesIO(original_bytes))
        except Exception:
            continue
        # svgelements only populates `.viewbox` from an explicit viewBox
        # attribute — it doesn't synthesize the spec's implicit
        # `0 0 width height` default when one is absent, so fall back to
        # the plain width/height attributes ourselves.
        viewbox = svg.viewbox
        canvas_w, canvas_h = (viewbox.width, viewbox.height) if viewbox is not None else (svg.width, svg.height)
        if not canvas_w or not canvas_h:
            continue

        bbox = _content_bbox(svg)
        if bbox is None:
            continue

        crop_box = _padded_crop_box(bbox, canvas_w, canvas_h)
        if crop_box is None:
            continue

        new_svg_text = _rewrite_root_box(svg_text, *crop_box)
        if new_svg_text is None:
            continue

        delta_x, delta_y = _offset_delta(crop_box, canvas_w, canvas_h)

        name = item.image.name
        storage = item.image.storage
        storage.delete(name)
        storage.save(name, BytesIO(new_svg_text.encode('utf-8')))

        item.offset_x += delta_x
        item.offset_y += delta_y
        item.save(update_fields=['offset_x', 'offset_y'])

        for placement in EquippedItemPlacement.objects.filter(item=item):
            placement.offset_x += delta_x
            placement.offset_y += delta_y
            placement.save(update_fields=['offset_x', 'offset_y'])


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0031_add_raccoon_adventure_pack'),
    ]

    operations = [
        migrations.RunPython(crop_padding, migrations.RunPython.noop),
    ]
