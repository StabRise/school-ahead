"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Maximize2, RotateCw, Undo2 } from "lucide-react";
import type { AvatarLayer } from "./equipped-avatar";
import { ALPHA_HIT_THRESHOLD, getObjectContainBox, type HitTestLayer, normalizeRotation, pickTopLayerAt } from "./avatar-hit-test";

const SCALE_RANGE = { min: 0.3, max: 2.5 };
// How much offsetX/offsetY/rotation/scale must actually change across a
// whole gesture before it's worth a PATCH — guards against firing a save for
// a click that barely moved the pointer (e.g. a click-to-select that also
// nudges by a sub-pixel amount).
const CHANGE_EPSILON = { offset: 0.05, rotation: 0.1, scale: 0.01 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface AvatarTransform {
  offsetX: number;
  offsetY: number;
  rotation: number;
  scale: number;
}

interface FrameEdge {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface DragState {
  pointerId: number;
  mode: "move" | "rotate" | "resize";
  startClientX: number;
  startClientY: number;
  startOffsetX: number;
  startOffsetY: number;
  startRotation: number;
  startScale: number;
  // How far beyond the canvas's own 0-100 box (percent of the canvas) an
  // item may still travel before hitting the *visible* frame edge — see
  // computeFrameEdge. Captured once per gesture (frame padding doesn't
  // change mid-drag) rather than recomputed on every pointermove.
  frameEdge: FrameEdge;
  // Only set for mode "rotate"/"resize" — the item's screen-space center at
  // drag start, plus (depending on mode) the pointer's starting angle from
  // it or its starting distance to it.
  centerX?: number;
  centerY?: number;
  startAngle?: number;
  startDistance?: number;
}

// `previewRef`'s own box (the 0-100 canvas AvatarLayer offsets are measured
// against) sits inset from the actual visible frame by that frame's own
// padding — computeMoveBounds should let a dragged item reach that visible
// edge, not stop short of it at previewRef's own (padded-in) edge. Measured
// live off the DOM (previewRef's rect vs. its parent's — the `frameClassName`
// div — rect) instead of a hardcoded pixel constant, since this component is
// shared by callers with different padding (the student's profile editor vs.
// the tutor's catalog editor).
function computeFrameEdge(previewEl: HTMLElement): FrameEdge {
  const previewRect = previewEl.getBoundingClientRect();
  const frameRect = previewEl.parentElement?.getBoundingClientRect() ?? previewRect;
  return {
    left: -(50 + ((previewRect.left - frameRect.left) / previewRect.width) * 100),
    right: 50 + ((frameRect.right - previewRect.right) / previewRect.width) * 100,
    top: -(50 + ((previewRect.top - frameRect.top) / previewRect.height) * 100),
    bottom: 50 + ((frameRect.bottom - previewRect.bottom) / previewRect.height) * 100,
  };
}

// Opaque-pixel bounds within an image, as a fraction (0-1) of its own
// width/height — null for a fully transparent image (shouldn't happen for a
// real item, but guards the loop below regardless).
interface OpaqueBoundingBox {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
}

interface LoadedLayerImage {
  width: number;
  height: number;
  sampleAlpha: ((u: number, v: number) => number) | null;
  bbox: OpaqueBoundingBox | null;
}

// Lazily decodes each layer's image once (cached by URL) so pointer-down hit
// testing can tell an actual (opaque) pixel of the item from the transparent
// padding around it in the same full-canvas PNG layer, and so the selection
// box (see getSelectedItemLocalBox) can wrap just that opaque region instead
// of the whole canvas. Reading pixel data off a cross-origin image without
// CORS headers throws (a "tainted" canvas) — caught below, falling back to a
// plain bounding-box hit test and a full-canvas selection box for that image
// rather than breaking selection entirely.
const layerImageCache = new Map<string, Promise<LoadedLayerImage>>();

function loadLayerImage(url: string): Promise<LoadedLayerImage> {
  let promise = layerImageCache.get(url);
  if (!promise) {
    promise = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const width = img.naturalWidth || 1;
        const height = img.naturalHeight || 1;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("no 2d context");
          ctx.drawImage(img, 0, 0);
          const { data } = ctx.getImageData(0, 0, width, height);

          let minX = width;
          let minY = height;
          let maxX = -1;
          let maxY = -1;
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              if (data[(y * width + x) * 4 + 3] >= ALPHA_HIT_THRESHOLD) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          const bbox: OpaqueBoundingBox | null =
            maxX >= minX ? { uMin: minX / width, uMax: (maxX + 1) / width, vMin: minY / height, vMax: (maxY + 1) / height } : null;

          resolve({
            width,
            height,
            bbox,
            sampleAlpha: (u, v) => {
              const x = clamp(Math.floor(u * width), 0, width - 1);
              const y = clamp(Math.floor(v * height), 0, height - 1);
              return data[(y * width + x) * 4 + 3];
            },
          });
        } catch {
          resolve({ width, height, sampleAlpha: null, bbox: null });
        }
      };
      img.onerror = () => resolve({ width: 1, height: 1, sampleAlpha: null, bbox: null });
      img.src = url;
    });
    layerImageCache.set(url, promise);
  }
  return promise;
}

// The selected item's bounding box in its own unscaled, unrotated local
// space (percent of canvas, same box-size convention as avatar-hit-test.ts's
// getObjectContainBox) — center offset from the layer's own origin plus
// width/height. Falls back to the full object-contain box (the old,
// oversized behavior) if pixel data isn't available yet or the canvas was
// tainted.
function getSelectedItemLocalBox(loaded: LoadedLayerImage | undefined): { width: number; height: number; centerX: number; centerY: number } {
  const naturalWidth = loaded?.width ?? 1;
  const naturalHeight = loaded?.height ?? 1;
  const { width: drawW, height: drawH } = getObjectContainBox(naturalWidth, naturalHeight);
  const bbox = loaded?.bbox ?? { uMin: 0, uMax: 1, vMin: 0, vMax: 1 };
  return {
    width: (bbox.uMax - bbox.uMin) * drawW,
    height: (bbox.vMax - bbox.vMin) * drawH,
    centerX: ((bbox.uMin + bbox.uMax) / 2 - 0.5) * drawW,
    centerY: ((bbox.vMin + bbox.vMax) / 2 - 0.5) * drawH,
  };
}

// The offsetX/offsetY range (percent of canvas) that keeps an item's actual
// opaque artwork — not the full transparent canvas-sized layer it's drawn
// inside of — fully inside the *visible frame* (frameEdge, see
// computeFrameEdge — not just previewRef's own 0-100 box) at a given scale/
// rotation, so it can never be dragged or resized far enough to be cropped
// by the frame's own `overflow-hidden` edge, while still letting it use the
// full padded area a caller's frame actually shows. `local` is the item's
// own unscaled/unrotated box from getSelectedItemLocalBox.
function computeMoveBounds(
  local: { width: number; height: number; centerX: number; centerY: number },
  scale: number,
  rotationDeg: number,
  frameEdge: FrameEdge,
): { xMin: number; xMax: number; yMin: number; yMax: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const kx = (local.centerX * cos - local.centerY * sin) * scale;
  const ky = (local.centerX * sin + local.centerY * cos) * scale;
  const halfW = (local.width * scale) / 2;
  const halfH = (local.height * scale) / 2;
  const hx = halfW * Math.abs(cos) + halfH * Math.abs(sin);
  const hy = halfW * Math.abs(sin) + halfH * Math.abs(cos);
  const xLow = frameEdge.left - kx + hx;
  const xHigh = frameEdge.right - kx - hx;
  const yLow = frameEdge.top - ky + hy;
  const yHigh = frameEdge.bottom - ky - hy;
  // If the (scaled) item is simply too big to fit at all, xLow > xHigh —
  // fall back to the tightest valid point (dead-centered on that axis)
  // rather than leaving an inverted range for `clamp` to mishandle.
  return {
    xMin: Math.min(xLow, xHigh),
    xMax: Math.max(xLow, xHigh),
    yMin: Math.min(yLow, yHigh),
    yMax: Math.max(yLow, yHigh),
  };
}

export interface AvatarPlacementResetButton {
  onReset: () => void;
  isPending?: boolean;
}

// The interactive placement editor shared by the student's own profile
// (components/profile/avatar-preview.tsx in apps/web) and the tutor's
// avatar-item catalog editor (components/tutor/tutor-avatar-editor-page.tsx)
// — same canvas, same click/drag/resize/(optional rotate) interactions,
// auto-saving on release. What differs between the two is only what's being
// edited (a student's personal placement override vs. an item template's
// default) and how it's saved — both handled entirely by the caller via
// `onCommit`, never by this component.
//
// `layers` is the full stack in draw order, same shape as
// EquippedAvatarLayers — a base body layer (itemId: null) is rendered but
// never selectable/interactive; every other layer is a candidate for
// selection and dragging. Click-to-select (pixel-alpha hit testing, so
// clicking transparent padding falls through to whatever's underneath) is
// optional — a caller that already drives selection from its own external
// list (the tutor's per-slot item picker) can turn it off and just control
// `activeItemId` directly, since with only one interactive layer ever
// mounted there, hit-testing across layers isn't needed.
export function AvatarPlacementEditor({
  layers,
  activeItemId,
  onActiveItemChange,
  onCommit,
  enableClickSelect = true,
  enableRotate = true,
  frameClassName = "aspect-square w-100 overflow-hidden rounded-xl bg-gray-100 p-8",
  isPending = false,
  resetButton = null,
}: {
  layers: AvatarLayer[];
  activeItemId: number | null;
  onActiveItemChange?: (itemId: number | null) => void;
  onCommit: (itemId: number, transform: AvatarTransform) => void;
  enableClickSelect?: boolean;
  enableRotate?: boolean;
  frameClassName?: string;
  isPending?: boolean;
  resetButton?: AvatarPlacementResetButton | null;
}) {
  const t = useTranslations("AvatarPlacementEditor");
  const previewRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  // State, not a ref: the selection box's size (see selectedBox below) is
  // computed from this during render, and a ref's mutations wouldn't be
  // visible there — reading ref.current during render also isn't safe in
  // general (its value can change without triggering the re-render that
  // read depends on).
  const [layerImages, setLayerImages] = useState<Map<number, LoadedLayerImage>>(new Map());
  const [draft, setDraft] = useState<AvatarTransform | null>(null);

  const layersById = new Map(layers.filter((layer) => layer.itemId !== null).map((layer) => [layer.itemId as number, layer]));

  // A wardrobe/catalog change (unequip, a different item picked) can drop
  // the layer this editor had selected — deselect rather than keep pointing
  // at something no longer on the canvas.
  if (activeItemId !== null && !layersById.has(activeItemId)) {
    onActiveItemChange?.(null);
    if (draft !== null) setDraft(null);
  }

  // Kick off (cached) pixel decoding for every layer — fire-and-forget, hit
  // testing/selection-box sizing below tolerate a still-pending load.
  const layerImageKey = layers.map((layer) => `${layer.itemId ?? ""}:${layer.image}`).join("|");
  useEffect(() => {
    for (const layer of layers) {
      if (layer.itemId === null || layerImages.has(layer.itemId)) continue;
      const itemId = layer.itemId;
      loadLayerImage(layer.image).then((loaded) => {
        setLayerImages((prev) => (prev.get(itemId) === loaded ? prev : new Map(prev).set(itemId, loaded)));
      });
    }
    // layerImageKey summarizes `layers` (id+url pairs) for this effect's
    // purposes — re-running per object identity churn would just redundantly
    // hit the already-cached loadLayerImage promise anyway, but keying on
    // the summary avoids that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerImageKey]);

  const activeLayer = activeItemId !== null ? layersById.get(activeItemId) : undefined;
  const effective: AvatarTransform | null = activeLayer
    ? (draft ?? {
        offsetX: activeLayer.offsetX,
        offsetY: activeLayer.offsetY,
        rotation: activeLayer.rotation,
        scale: activeLayer.scale,
      })
    : null;

  const renderLayers: AvatarLayer[] = layers.map((layer) => (layer.itemId === activeItemId && effective ? { ...layer, ...effective } : layer));

  // The selection box/handles need to wrap the item's actual (opaque)
  // artwork, not the full canvas-sized layer image it's drawn inside of —
  // see getSelectedItemLocalBox. That local box is unscaled/unrotated, so it
  // still needs the same scale-then-rotate-then-translate composition the
  // layer's own CSS transform applies (translate(...) rotate(...)
  // scale(...), which — since transforms are read right-to-left as points
  // are transformed — scales the box first, then rotates it, then
  // translates it into place) to land at the right spot on the canvas.
  const selectedBox = (() => {
    if (!effective || activeItemId === null) return null;
    const local = getSelectedItemLocalBox(layerImages.get(activeItemId));
    const scaledCenterX = local.centerX * effective.scale;
    const scaledCenterY = local.centerY * effective.scale;
    const rad = (effective.rotation * Math.PI) / 180;
    const rotatedCenterX = scaledCenterX * Math.cos(rad) - scaledCenterY * Math.sin(rad);
    const rotatedCenterY = scaledCenterX * Math.sin(rad) + scaledCenterY * Math.cos(rad);
    return {
      centerXPercent: 50 + effective.offsetX + rotatedCenterX,
      centerYPercent: 50 + effective.offsetY + rotatedCenterY,
      widthPercent: local.width * effective.scale,
      heightPercent: local.height * effective.scale,
    };
  })();

  const transformsMatch = (a: AvatarTransform, b: AvatarTransform): boolean =>
    Math.abs(a.offsetX - b.offsetX) <= CHANGE_EPSILON.offset &&
    Math.abs(a.offsetY - b.offsetY) <= CHANGE_EPSILON.offset &&
    Math.abs(a.rotation - b.rotation) <= CHANGE_EPSILON.rotation &&
    Math.abs(a.scale - b.scale) <= CHANGE_EPSILON.scale;

  // Once a real commit fires (see handleCanvasPointerUp), `draft` is left in
  // place — showing the just-dragged/resized value — rather than cleared
  // immediately: `layers` is a prop, sourced from the caller's own
  // (React Query-backed) data, which still reflects the pre-commit value
  // until onCommit's mutation resolves and its cache update flows back down.
  // Clearing draft right away would show that stale value for however long
  // that round-trip takes — a visible snap-back-then-forward. Instead, drop
  // it here, during render, only once the prop data itself has caught up to
  // what was committed — same "adjust state during render" pattern as the
  // deselect guard above, rather than an effect (which would fire a
  // redundant extra render after the one that already has the right data).
  if (draft && activeLayer && transformsMatch(activeLayer, draft)) {
    setDraft(null);
  }

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPending) return;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;

    let hitItemId = activeItemId;
    if (enableClickSelect) {
      const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
      const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
      const hitLayers: HitTestLayer[] = layers.map((layer) => {
        const loaded = layer.itemId !== null ? layerImages.get(layer.itemId) : undefined;
        return {
          itemId: layer.itemId,
          offsetX: layer.offsetX,
          offsetY: layer.offsetY,
          rotation: layer.rotation,
          scale: layer.scale,
          naturalWidth: loaded?.width ?? 1,
          naturalHeight: loaded?.height ?? 1,
          sampleAlpha: loaded?.sampleAlpha ?? null,
        };
      });
      hitItemId = pickTopLayerAt(hitLayers, xPercent, yPercent);
      onActiveItemChange?.(hitItemId);
      setDraft(null);
      if (hitItemId === null) return;
    }
    if (hitItemId === null) return;
    const layer = layersById.get(hitItemId);
    if (!layer) return;

    e.preventDefault();
    previewRef.current?.setPointerCapture(e.pointerId);
    setDraft(null);
    dragStateRef.current = {
      pointerId: e.pointerId,
      mode: "move",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: layer.offsetX,
      startOffsetY: layer.offsetY,
      startRotation: layer.rotation,
      startScale: layer.scale,
      frameEdge: computeFrameEdge(previewRef.current!),
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== e.pointerId || !rect || activeItemId === null) return;
    const local = getSelectedItemLocalBox(layerImages.get(activeItemId));

    if (drag.mode === "move") {
      const dxPercent = ((e.clientX - drag.startClientX) / rect.width) * 100;
      const dyPercent = ((e.clientY - drag.startClientY) / rect.height) * 100;
      const bounds = computeMoveBounds(local, drag.startScale, drag.startRotation, drag.frameEdge);
      setDraft({
        offsetX: clamp(drag.startOffsetX + dxPercent, bounds.xMin, bounds.xMax),
        offsetY: clamp(drag.startOffsetY + dyPercent, bounds.yMin, bounds.yMax),
        rotation: drag.startRotation,
        scale: drag.startScale,
      });
    } else if (drag.mode === "rotate" && drag.centerX !== undefined && drag.centerY !== undefined && drag.startAngle !== undefined) {
      const angleNow = Math.atan2(e.clientY - drag.centerY, e.clientX - drag.centerX);
      const deltaDeg = ((angleNow - drag.startAngle) * 180) / Math.PI;
      const rotation = normalizeRotation(drag.startRotation + deltaDeg);
      const bounds = computeMoveBounds(local, drag.startScale, rotation, drag.frameEdge);
      setDraft({
        offsetX: clamp(drag.startOffsetX, bounds.xMin, bounds.xMax),
        offsetY: clamp(drag.startOffsetY, bounds.yMin, bounds.yMax),
        rotation,
        scale: drag.startScale,
      });
    } else if (drag.mode === "resize" && drag.centerX !== undefined && drag.centerY !== undefined && drag.startDistance !== undefined) {
      const distanceNow = Math.hypot(e.clientX - drag.centerX, e.clientY - drag.centerY);
      const scale = clamp((drag.startScale * distanceNow) / drag.startDistance, SCALE_RANGE.min, SCALE_RANGE.max);
      const bounds = computeMoveBounds(local, scale, drag.startRotation, drag.frameEdge);
      setDraft({
        offsetX: clamp(drag.startOffsetX, bounds.xMin, bounds.xMax),
        offsetY: clamp(drag.startOffsetY, bounds.yMin, bounds.yMax),
        rotation: drag.startRotation,
        scale,
      });
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragStateRef.current = null;
    if (activeItemId === null || !draft) return;
    const start: AvatarTransform = {
      offsetX: drag.startOffsetX,
      offsetY: drag.startOffsetY,
      rotation: drag.startRotation,
      scale: drag.startScale,
    };
    if (transformsMatch(draft, start)) {
      // Nothing actually changed (e.g. a click that barely moved the
      // pointer) — nothing to save, so nothing to wait for either; clear
      // the draft immediately.
      setDraft(null);
    } else {
      onCommit(activeItemId, draft);
      // Leave `draft` in place — the effect above clears it once `layers`
      // itself reflects the commit.
    }
  };

  const handleRotateHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (isPending || !effective || activeItemId === null) return;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    previewRef.current?.setPointerCapture(e.pointerId);
    const centerX = rect.left + rect.width * (0.5 + effective.offsetX / 100);
    const centerY = rect.top + rect.height * (0.5 + effective.offsetY / 100);
    dragStateRef.current = {
      pointerId: e.pointerId,
      mode: "rotate",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: effective.offsetX,
      startOffsetY: effective.offsetY,
      startRotation: effective.rotation,
      startScale: effective.scale,
      frameEdge: computeFrameEdge(previewRef.current!),
      centerX,
      centerY,
      startAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX),
    };
  };

  const handleResizeHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (isPending || !effective || activeItemId === null) return;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    previewRef.current?.setPointerCapture(e.pointerId);
    const centerX = rect.left + rect.width * (0.5 + effective.offsetX / 100);
    const centerY = rect.top + rect.height * (0.5 + effective.offsetY / 100);
    dragStateRef.current = {
      pointerId: e.pointerId,
      mode: "resize",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: effective.offsetX,
      startOffsetY: effective.offsetY,
      startRotation: effective.rotation,
      startScale: effective.scale,
      frameEdge: computeFrameEdge(previewRef.current!),
      centerX,
      centerY,
      // Guard against a zero-length start distance (pointer exactly on
      // center) — would make every subsequent scale ratio blow up or divide
      // by zero.
      startDistance: Math.hypot(e.clientX - centerX, e.clientY - centerY) || 1,
    };
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={frameClassName}>
        <div
          ref={previewRef}
          className="relative h-full w-full touch-none"
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
        >
          {renderLayers.map((layer, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={layer.itemId ?? `${layer.image}-${index}`}
              src={layer.image}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-contain"
              style={{
                transform: `translate(${layer.offsetX}%, ${layer.offsetY}%) rotate(${layer.rotation}deg) scale(${layer.scale})`,
              }}
            />
          ))}

          {effective && selectedBox && (
            // Positioned by its own center (selectedBox.centerXPercent/Y) and
            // sized to the item's actual opaque artwork (not the full
            // canvas-sized layer image it's drawn inside of) — see
            // getSelectedItemLocalBox. `translate(-50%, -50%) rotate(...)`
            // rotates the box in place around that same center point
            // regardless of its width/height, matching how the item's own
            // layer image visually rotates around that point.
            <div
              className="pointer-events-none absolute"
              style={{
                left: `${selectedBox.centerXPercent}%`,
                top: `${selectedBox.centerYPercent}%`,
                width: `${selectedBox.widthPercent}%`,
                height: `${selectedBox.heightPercent}%`,
                transform: `translate(-50%, -50%) rotate(${effective.rotation}deg)`,
              }}
            >
              <div className="absolute inset-0 rounded-md border-2 border-dashed border-sky-400" />
              {resetButton && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={resetButton.onReset}
                  disabled={resetButton.isPending}
                  title={t("resetPosition")}
                  aria-label={t("resetPosition")}
                  className="pointer-events-auto absolute -left-3.5 -top-3.5 flex h-7 w-7 items-center justify-center rounded-full border border-sky-300 bg-white text-sky-600 shadow disabled:opacity-60"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              )}
              {enableRotate && (
                <div
                  onPointerDown={handleRotateHandlePointerDown}
                  role="button"
                  tabIndex={-1}
                  aria-label={t("rotateItem")}
                  title={t("rotateItem")}
                  className="pointer-events-auto absolute left-1/2 -top-8 flex h-7 w-7 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-sky-300 bg-white text-sky-600 shadow active:cursor-grabbing"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </div>
              )}
              <div
                onPointerDown={handleResizeHandlePointerDown}
                role="button"
                tabIndex={-1}
                aria-label={t("resizeItem")}
                title={t("resizeItem")}
                className="pointer-events-auto absolute -bottom-3.5 -right-3.5 flex h-7 w-7 cursor-nwse-resize items-center justify-center rounded-full border border-sky-300 bg-white text-sky-600 shadow active:cursor-nwse-resize"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
