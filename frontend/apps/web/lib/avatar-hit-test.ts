// Picking which equipped wardrobe item a click landed on, on the avatar
// canvas — see components/profile/avatar-preview.tsx's interactive editor
// (docs/core/avatar.md section 2.2: "click clothing to select it, like in a
// graphic editor"). Every layer is a full-canvas transparent PNG stacked on
// top of each other (see @school-ahead/preschool-ui's EquippedAvatarLayers),
// so a naive topmost-DOM-element hit test would always pick whichever item
// draws last regardless of where its actual (opaque) pixels are — this
// instead walks layers top-down and, for each, undoes its CSS transform to
// find the point in the item's own unrotated/unscaled box, then (once pixel
// data has loaded — see the sampleAlpha callback) skips it if that pixel is
// transparent, falling through to whatever's underneath. Exactly the
// click-through-transparency behavior a graphic editor gives you.

export interface HitTestLayer {
  // null for the base avatar body layer — never selectable, so it's always
  // skipped rather than treated as a hit.
  itemId: number | null;
  // Percent of the canvas, same convention as AvatarItem.offset_x/offset_y.
  offsetX: number;
  offsetY: number;
  // Degrees, clockwise.
  rotation: number;
  scale: number;
  naturalWidth: number;
  naturalHeight: number;
  // Alpha (0-255) at normalized image coordinates (u, v) in [0, 1] x [0, 1].
  // null while the image's pixel data hasn't loaded yet (or couldn't, e.g. a
  // tainted canvas) — treated as fully opaque so a click still selects the
  // layer instead of silently missing it.
  sampleAlpha: ((u: number, v: number) => number) | null;
}

export const ALPHA_HIT_THRESHOLD = 24;

// object-contain sizing of a naturalWidth x naturalHeight source image within
// a boxSize x boxSize (percent) square box, matching the CSS `object-contain`
// every equipped-item <img> uses. Shared by the hit test below and by
// avatar-preview.tsx's selection-box sizing, so both agree on where a given
// layer's image actually draws.
export function getObjectContainBox(naturalWidth: number, naturalHeight: number, boxSize = 100): { width: number; height: number } {
  const imgAspect = naturalWidth / naturalHeight;
  return imgAspect >= 1
    ? { width: boxSize, height: boxSize / imgAspect }
    : { width: boxSize * imgAspect, height: boxSize };
}

// xPercent/yPercent are click coordinates as a percent of the canvas
// (0-100 on each axis, origin top-left) — layers is in draw order
// (bottom-most first), same as AvatarLayer[] everywhere else.
export function pickTopLayerAt(layers: HitTestLayer[], xPercent: number, yPercent: number): number | null {
  const cx = xPercent - 50;
  const cy = yPercent - 50;

  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (layer.itemId === null) continue;
    if (!layer.naturalWidth || !layer.naturalHeight) continue;

    // Undo translate -> rotate -> scale (the order EquippedAvatarLayers
    // applies them in) to land back in the layer's own centered box.
    const dx = cx - layer.offsetX;
    const dy = cy - layer.offsetY;
    const rad = (-layer.rotation * Math.PI) / 180;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    const lx = rx / layer.scale;
    const ly = ry / layer.scale;

    const { width: drawW, height: drawH } = getObjectContainBox(layer.naturalWidth, layer.naturalHeight);

    if (Math.abs(lx) > drawW / 2 || Math.abs(ly) > drawH / 2) continue;

    if (!layer.sampleAlpha) return layer.itemId;
    const u = lx / drawW + 0.5;
    const v = ly / drawH + 0.5;
    if (layer.sampleAlpha(u, v) >= ALPHA_HIT_THRESHOLD) return layer.itemId;
  }
  return null;
}

// Keeps a rotation in (-180, 180] regardless of how far a rotate gesture
// dragged past a full turn, so stored values (and the slider-free rotate
// handle) never accumulate to unbounded degrees.
export function normalizeRotation(degrees: number): number {
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}
