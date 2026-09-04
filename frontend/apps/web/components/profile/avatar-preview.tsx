"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, RotateCw, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { AvatarLayer, itemsToLayers, useEquippedAvatarLayers } from "@school-ahead/preschool-ui";
import { getMeQueryKey, useResetAvatarItemPlacement, useUpdateAvatarItemPlacement } from "@school-ahead/api-client/browser/auth/auth";
import { mapApiUserToAuthUser } from "@school-ahead/api-client";
import { useAuthStore, type EquippedAvatarItem } from "@school-ahead/api-client";
import { useAvatarTryOnStore } from "@/stores/avatar-tryon-store";
import { ALPHA_HIT_THRESHOLD, getObjectContainBox, type HitTestLayer, normalizeRotation, pickTopLayerAt } from "@/lib/avatar-hit-test";

const MOVE_RANGE = { min: -50, max: 50 };
const SCALE_RANGE = { min: 0.3, max: 2.5 };
const CHANGE_EPSILON = { offset: 0.05, rotation: 0.1, scale: 0.01 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface Draft {
  offsetX: number;
  offsetY: number;
  rotation: number;
  scale: number;
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
  // Only set for mode "rotate"/"resize" — the item's screen-space center at
  // drag start, plus (depending on mode) the pointer's starting angle from
  // it or its starting distance to it.
  centerX?: number;
  centerY?: number;
  startAngle?: number;
  startDistance?: number;
}

// Opaque-pixel bounds within an image, as a fraction (0-1) of its own
// width/height — null for a fully transparent image (shouldn't happen for a
// real equipped item, but guards the loop below regardless).
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

// Lazily decodes each equipped item's image once (cached by URL) so
// pointer-down hit testing (see lib/avatar-hit-test.ts) can tell an actual
// (opaque) pixel of the item from the transparent padding around it in the
// same full-canvas PNG layer, and so the selection box (see
// getSelectedItemLocalBox) can wrap just that opaque region instead of the
// whole canvas. Reading pixel data off a cross-origin image without CORS
// headers throws (a "tainted" canvas) — caught below, falling back to a
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

          // Every equipped-item layer is a full-canvas transparent PNG with
          // the actual artwork occupying only some smaller region of it (see
          // lib/avatar-hit-test.ts) — the selection box needs that region's
          // bounds, not the whole image, to actually wrap the visible item
          // instead of the full canvas.
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
// space (percent of canvas, same box-size convention as
// lib/avatar-hit-test.ts's getObjectContainBox) — center offset from the
// layer's own origin plus width/height. Falls back to the full
// object-contain box (the old, oversized behavior) if pixel data isn't
// available yet or the canvas was tainted.
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

// Full-size composited preview of the student's equipped avatar (body ->
// clothing -> headwear -> accessory), plus a not-yet-purchased item being
// tried on — see docs/core/avatar.md section 2. Also the interactive
// editor for that wardrobe's placement: clicking an equipped item selects
// it (like in a graphic editor — see lib/avatar-hit-test.ts), and the
// selected item can then be dragged to move it or rotated with the handle
// above it. This position/rotation override is saved per-item
// (EquippedItemPlacement on the backend) and is private to this student —
// only ever applied when rendering their own equipped avatar, here and
// everywhere else it's shown (header, preschool companions, ...), never to
// any other viewer of their avatar. See @school-ahead/preschool-ui for the
// shared layering logic every other companion frame builds on — this is
// the one place that also makes those layers interactive.
export function AvatarPreview() {
  const t = useTranslations("Profile");
  const user = useAuthStore((state) => state.user);
  const isPreschool = user?.interfaceMode === "preschool";
  const setUser = useAuthStore((state) => state.setUser);
  const tryOnItem = useAvatarTryOnStore((state) => state.tryOnItem);
  const queryClient = useQueryClient();
  const updatePlacement = useUpdateAvatarItemPlacement();
  const resetPlacement = useResetAvatarItemPlacement();

  const equippedLayers = useEquippedAvatarLayers();
  const tryOnLayers = itemsToLayers(tryOnItem ? [tryOnItem] : undefined);

  const equippedItems: EquippedAvatarItem[] = [
    ...(user?.equippedClothingItems ?? []),
    ...(user?.equippedHeadwearItems ?? []),
    ...(user?.equippedAccessoryItems ?? []),
  ];
  const equippedItemsById = new Map(equippedItems.map((item) => [item.id, item]));

  const previewRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  // State, not a ref: the selection box's size (see selectedBox below) is
  // computed from this during render, and a ref's mutations wouldn't be
  // visible there — reading ref.current during render also isn't safe in
  // general (its value can change without triggering the re-render that
  // read depends on).
  const [layerImages, setLayerImages] = useState<Map<number, LoadedLayerImage>>(new Map());

  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  // A wardrobe change (unequip, or a stack-order change re-rendering a
  // different set) can drop the item this preview had selected — deselect
  // rather than keep pointing at something no longer on the avatar. Same
  // "adjust state during render" pattern as TutorAvatarEditorPage.
  if (selectedItemId !== null && !equippedItemsById.has(selectedItemId)) {
    setSelectedItemId(null);
    if (draft !== null) setDraft(null);
  }

  // Kick off (cached) pixel decoding for every currently-equipped image —
  // fire-and-forget, hit testing below tolerates a still-pending load.
  const equippedImageKey = equippedLayers.map((layer) => `${layer.itemId ?? ""}:${layer.image}`).join("|");
  useEffect(() => {
    for (const layer of equippedLayers) {
      if (layer.itemId === null || layerImages.has(layer.itemId)) continue;
      const itemId = layer.itemId;
      loadLayerImage(layer.image).then((loaded) => {
        setLayerImages((prev) => (prev.get(itemId) === loaded ? prev : new Map(prev).set(itemId, loaded)));
      });
    }
    // equippedImageKey summarizes equippedLayers (id+url pairs) for this
    // effect's purposes — re-running per object identity churn would just
    // redundantly hit the already-cached loadLayerImage promise anyway, but
    // keying on the summary avoids that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equippedImageKey]);

  const selectedItem = selectedItemId !== null ? equippedItemsById.get(selectedItemId) : undefined;
  const effective: Draft | null = selectedItem
    ? (draft ?? {
        offsetX: selectedItem.offsetX,
        offsetY: selectedItem.offsetY,
        rotation: selectedItem.rotation,
        scale: selectedItem.scale,
      })
    : null;

  const renderLayers: AvatarLayer[] = [...equippedLayers, ...tryOnLayers].map((layer) =>
    layer.itemId === selectedItemId && effective ? { ...layer, ...effective } : layer,
  );

  // The selection box/handles need to wrap the item's actual (opaque)
  // artwork, not the full canvas-sized layer image it's drawn inside of —
  // see getSelectedItemLocalBox. That local box is unscaled/unrotated, so it
  // still needs the same scale-then-rotate-then-translate composition the
  // layer's own CSS transform applies (translate(...) rotate(...)
  // scale(...), which — since transforms are read right-to-left as points
  // are transformed — scales the box first, then rotates it, then
  // translates it into place) to land at the right spot on the canvas.
  const selectedBox = (() => {
    if (!effective || selectedItemId === null) return null;
    const local = getSelectedItemLocalBox(layerImages.get(selectedItemId));
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

  const savePlacement = (itemId: number, next: Draft) => {
    updatePlacement.mutate(
      { itemId, data: { offset_x: next.offsetX, offset_y: next.offsetY, rotation: next.rotation, scale: next.scale } },
      {
        onSuccess: (response) => {
          setUser(mapApiUserToAuthUser(response.user));
          queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
        },
        onSettled: () => setDraft(null),
      },
    );
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (updatePlacement.isPending || resetPlacement.isPending) return;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;

    const hitLayers: HitTestLayer[] = equippedLayers.map((layer) => {
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
    const hitItemId = pickTopLayerAt(hitLayers, xPercent, yPercent);
    if (hitItemId === null) {
      setSelectedItemId(null);
      setDraft(null);
      return;
    }
    const item = equippedItemsById.get(hitItemId);
    if (!item) return;

    e.preventDefault();
    previewRef.current?.setPointerCapture(e.pointerId);
    setSelectedItemId(hitItemId);
    setDraft(null);
    dragStateRef.current = {
      pointerId: e.pointerId,
      mode: "move",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: item.offsetX,
      startOffsetY: item.offsetY,
      startRotation: item.rotation,
      startScale: item.scale,
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== e.pointerId || !rect) return;

    if (drag.mode === "move") {
      const dxPercent = ((e.clientX - drag.startClientX) / rect.width) * 100;
      const dyPercent = ((e.clientY - drag.startClientY) / rect.height) * 100;
      setDraft({
        offsetX: clamp(drag.startOffsetX + dxPercent, MOVE_RANGE.min, MOVE_RANGE.max),
        offsetY: clamp(drag.startOffsetY + dyPercent, MOVE_RANGE.min, MOVE_RANGE.max),
        rotation: drag.startRotation,
        scale: drag.startScale,
      });
    } else if (drag.mode === "rotate" && drag.centerX !== undefined && drag.centerY !== undefined && drag.startAngle !== undefined) {
      const angleNow = Math.atan2(e.clientY - drag.centerY, e.clientX - drag.centerX);
      const deltaDeg = ((angleNow - drag.startAngle) * 180) / Math.PI;
      setDraft({
        offsetX: drag.startOffsetX,
        offsetY: drag.startOffsetY,
        rotation: normalizeRotation(drag.startRotation + deltaDeg),
        scale: drag.startScale,
      });
    } else if (
      drag.mode === "resize" &&
      drag.centerX !== undefined &&
      drag.centerY !== undefined &&
      drag.startDistance !== undefined
    ) {
      const distanceNow = Math.hypot(e.clientX - drag.centerX, e.clientY - drag.centerY);
      setDraft({
        offsetX: drag.startOffsetX,
        offsetY: drag.startOffsetY,
        rotation: drag.startRotation,
        scale: clamp((drag.startScale * distanceNow) / drag.startDistance, SCALE_RANGE.min, SCALE_RANGE.max),
      });
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragStateRef.current = null;

    if (selectedItemId === null || !draft) return;
    const changed =
      Math.abs(draft.offsetX - drag.startOffsetX) > CHANGE_EPSILON.offset ||
      Math.abs(draft.offsetY - drag.startOffsetY) > CHANGE_EPSILON.offset ||
      Math.abs(draft.rotation - drag.startRotation) > CHANGE_EPSILON.rotation ||
      Math.abs(draft.scale - drag.startScale) > CHANGE_EPSILON.scale;
    if (!changed) {
      setDraft(null);
      return;
    }
    savePlacement(selectedItemId, draft);
  };

  const handleRotateHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (updatePlacement.isPending || resetPlacement.isPending || !effective || selectedItemId === null) return;
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
      centerX,
      centerY,
      startAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX),
    };
  };

  const handleResizeHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (updatePlacement.isPending || resetPlacement.isPending || !effective || selectedItemId === null) return;
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
      centerX,
      centerY,
      // Guard against a zero-length start distance (pointer exactly on
      // center) — would make every subsequent scale ratio blow up or divide
      // by zero.
      startDistance: Math.hypot(e.clientX - centerX, e.clientY - centerY) || 1,
    };
  };

  const handleResetPlacement = () => {
    if (selectedItemId === null || updatePlacement.isPending || resetPlacement.isPending) return;
    resetPlacement.mutate(
      { itemId: selectedItemId },
      {
        onSuccess: (response) => {
          setUser(mapApiUserToAuthUser(response.user));
          queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
        },
      },
    );
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`aspect-square w-100 shrink-0 overflow-hidden rounded-xl p-8 ${
          isPreschool ? "bg-gradient-to-br from-sky-100 via-emerald-50 to-lime-100 ring-4 ring-white shadow-lg" : "bg-gray-100"
        }`}
      >
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
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleResetPlacement}
                disabled={resetPlacement.isPending}
                title={t("wardrobeResetPosition")}
                aria-label={t("wardrobeResetPosition")}
                className="pointer-events-auto absolute -left-3.5 -top-3.5 flex h-7 w-7 items-center justify-center rounded-full border border-sky-300 bg-white text-sky-600 shadow disabled:opacity-60"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <div
                onPointerDown={handleRotateHandlePointerDown}
                role="button"
                tabIndex={-1}
                aria-label={t("wardrobeRotateItem")}
                title={t("wardrobeRotateItem")}
                className="pointer-events-auto absolute left-1/2 -top-8 flex h-7 w-7 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-sky-300 bg-white text-sky-600 shadow active:cursor-grabbing"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </div>
              <div
                onPointerDown={handleResizeHandlePointerDown}
                role="button"
                tabIndex={-1}
                aria-label={t("wardrobeResizeItem")}
                title={t("wardrobeResizeItem")}
                className="pointer-events-auto absolute -bottom-3.5 -right-3.5 flex h-7 w-7 cursor-nwse-resize items-center justify-center rounded-full border border-sky-300 bg-white text-sky-600 shadow active:cursor-nwse-resize"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </div>
            </div>
          )}
        </div>
      </div>
      {selectedItemId !== null && <p className="text-xs text-gray-500">{t("wardrobeDragHint")}</p>}
    </div>
  );
}
