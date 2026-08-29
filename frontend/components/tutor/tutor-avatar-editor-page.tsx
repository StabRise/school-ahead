"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import type { AvatarOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import {
  getListTutorAvatarsQueryKey,
  useListTutorAvatars,
  useUpdateTutorAvatarItemTransform,
  useUpdateTutorAvatarTransform,
} from "@/lib/api/browser/tutor/tutor";
import { PageContainer } from "@/components/page-container";
import { AvatarEditorSlider } from "@/components/tutor/avatar-editor-slider";

const SLOTS = ["clothing", "headwear", "accessory"] as const;

const SCALE_RANGE = { min: 0.3, max: 2.5, step: 0.01 };
const OFFSET_RANGE = { min: -50, max: 50, step: 0.5 };
const LAYER_ORDER_RANGE = { min: 0, max: 6, step: 1 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface ItemDraft {
  scale: number;
  offsetX: number;
  offsetY: number;
  layerOrder: number;
}

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startOffsetX: number;
  startOffsetY: number;
}

function AvatarThumb({ avatar }: { avatar: AvatarOut }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100">
      {avatar.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar.image} alt="" className="h-full w-full object-cover" />
      ) : null}
    </span>
  );
}

export function TutorAvatarEditorPage() {
  const t = useTranslations("TutorAvatarEditor");
  const tSlot = useTranslations("Profile");
  const queryClient = useQueryClient();
  const { data: avatars, isLoading, isError } = useListTutorAvatars();
  const updateAvatar = useUpdateTutorAvatarTransform();
  const updateItem = useUpdateTutorAvatarItemTransform();

  const [selectedAvatarId, setSelectedAvatarId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [avatarScale, setAvatarScale] = useState(1);
  const [itemDraft, setItemDraft] = useState<ItemDraft>({ scale: 1, offsetX: 0, offsetY: 0, layerOrder: 0 });
  const previewRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);

  const resolvedAvatarId = selectedAvatarId ?? avatars?.[0]?.id ?? null;
  const avatar = avatars?.find((a) => a.id === resolvedAvatarId) ?? null;
  const items = avatar?.items ?? [];
  const item = items.find((i) => i.id === selectedItemId) ?? null;

  // Re-seed the drafts whenever the selection changes — draft state only
  // exists so sliders feel instant without a PATCH per tick. Adjusting state
  // during render (guarded by comparing against the last-seen id) instead of
  // in an effect, per https://react.dev/learn/you-might-not-need-an-effect.
  const [lastAvatarId, setLastAvatarId] = useState<number | null>(null);
  if ((avatar?.id ?? null) !== lastAvatarId) {
    setLastAvatarId(avatar?.id ?? null);
    setAvatarScale(avatar?.scale ?? 1);
  }

  const [lastItemId, setLastItemId] = useState<number | null>(null);
  if ((item?.id ?? null) !== lastItemId) {
    setLastItemId(item?.id ?? null);
    setItemDraft({
      scale: item?.scale ?? 1,
      offsetX: item?.offset_x ?? 0,
      offsetY: item?.offset_y ?? 0,
      layerOrder: item?.layer_order ?? 0,
    });
  }

  const handleSelectAvatar = (id: number) => {
    setSelectedAvatarId(id);
    setSelectedItemId(null);
  };

  const handleSaveAvatar = () => {
    if (!avatar) return;
    updateAvatar.mutate(
      { avatarId: avatar.id, data: { scale: avatarScale } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTutorAvatarsQueryKey() }) },
    );
  };

  const handleSaveItem = () => {
    if (!item) return;
    updateItem.mutate(
      {
        itemId: item.id,
        data: {
          scale: itemDraft.scale,
          offset_x: itemDraft.offsetX,
          offset_y: itemDraft.offsetY,
          layer_order: itemDraft.layerOrder,
        },
      },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTutorAvatarsQueryKey() }) },
    );
  };

  // Dragging moves the selected item by translating pointer-movement pixels
  // into percentages of the preview box — offsetX/offsetY are stored as
  // percentages of the avatar canvas (see AvatarPreview), and since the
  // item's own layer is sized to exactly fill that box, "percent of the
  // element" and "percent of the box" are the same number.
  const handleItemPointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: itemDraft.offsetX,
      startOffsetY: itemDraft.offsetY,
    };
  };

  const handleItemPointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    const drag = dragStateRef.current;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== e.pointerId || !rect) return;
    const deltaXPercent = ((e.clientX - drag.startClientX) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - drag.startClientY) / rect.height) * 100;
    setItemDraft((d) => ({
      ...d,
      offsetX: clamp(drag.startOffsetX + deltaXPercent, OFFSET_RANGE.min, OFFSET_RANGE.max),
      offsetY: clamp(drag.startOffsetY + deltaYPercent, OFFSET_RANGE.min, OFFSET_RANGE.max),
    }));
  };

  const handleItemPointerUp = (e: React.PointerEvent<HTMLImageElement>) => {
    if (dragStateRef.current?.pointerId === e.pointerId) {
      dragStateRef.current = null;
    }
  };

  return (
    <PageContainer title={t("title")}>
      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {avatars && avatars.length > 0 && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex shrink-0 flex-row gap-2 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible">
            {avatars.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => handleSelectAvatar(a.id)}
                aria-pressed={a.id === selectedAvatarId}
                className={`flex shrink-0 items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
                  a.id === selectedAvatarId
                    ? "border-gray-900 bg-gray-900/5"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <AvatarThumb avatar={a} />
                <span className="text-sm font-medium text-gray-700">{a.name}</span>
              </button>
            ))}
          </div>

          {avatar && (
            <div className="flex flex-1 flex-col gap-6 sm:flex-row sm:items-start">
              <div className="flex shrink-0 flex-col gap-2">
                <div ref={previewRef} className="relative aspect-square w-64 overflow-hidden rounded-xl bg-gray-100">
                  {avatar.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatar.image}
                      alt=""
                      className="absolute inset-0 h-full w-full"
                      style={{ transform: `scale(${avatarScale})` }}
                    />
                  )}
                  {/* Only the item being edited is shown, so the tutor sees exactly
                      what they're positioning instead of the whole stacked outfit. */}
                  {item?.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image}
                      alt=""
                      draggable={false}
                      onPointerDown={handleItemPointerDown}
                      onPointerMove={handleItemPointerMove}
                      onPointerUp={handleItemPointerUp}
                      className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
                      style={{ transform: `translate(${itemDraft.offsetX}%, ${itemDraft.offsetY}%) scale(${itemDraft.scale})` }}
                    />
                  )}
                </div>
                {item && <p className="text-xs text-gray-500">{t("dragHint")}</p>}
              </div>

              <div className="flex flex-1 flex-col gap-6">
                <div className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">{t("bodySectionTitle")}</h3>
                  <AvatarEditorSlider label={t("scale")} value={avatarScale} {...SCALE_RANGE} onChange={setAvatarScale} />
                  <button
                    type="button"
                    onClick={handleSaveAvatar}
                    disabled={updateAvatar.isPending}
                    className="self-start rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {t("save")}
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  {SLOTS.map((slot) => {
                    const slotItems = items.filter((i) => i.slot === slot);
                    if (slotItems.length === 0) return null;
                    return (
                      <div key={slot} className="flex flex-col gap-2">
                        <h4 className="text-sm font-semibold text-gray-700">{tSlot(`wardrobeSlot.${slot}`)}</h4>
                        <div className="flex flex-wrap gap-2">
                          {slotItems.map((candidate) => (
                            <button
                              key={candidate.id}
                              type="button"
                              onClick={() => setSelectedItemId(candidate.id)}
                              aria-pressed={candidate.id === selectedItemId}
                              title={candidate.name}
                              className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border bg-white transition-colors ${
                                candidate.id === selectedItemId
                                  ? "border-gray-900 bg-gray-900/5"
                                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                              }`}
                            >
                              {candidate.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={candidate.image} alt="" className="h-full w-full object-contain" />
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {item && (
                  <div className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-900">{item.name}</h3>
                    <AvatarEditorSlider
                      label={t("scale")}
                      value={itemDraft.scale}
                      {...SCALE_RANGE}
                      onChange={(scale) => setItemDraft((d) => ({ ...d, scale }))}
                    />
                    <AvatarEditorSlider
                      label={t("offsetX")}
                      value={itemDraft.offsetX}
                      {...OFFSET_RANGE}
                      onChange={(offsetX) => setItemDraft((d) => ({ ...d, offsetX }))}
                    />
                    <AvatarEditorSlider
                      label={t("offsetY")}
                      value={itemDraft.offsetY}
                      {...OFFSET_RANGE}
                      onChange={(offsetY) => setItemDraft((d) => ({ ...d, offsetY }))}
                    />
                    {item.slot === "clothing" && (
                      <AvatarEditorSlider
                        label={t("layerOrder")}
                        value={itemDraft.layerOrder}
                        {...LAYER_ORDER_RANGE}
                        decimals={0}
                        onChange={(layerOrder) => setItemDraft((d) => ({ ...d, layerOrder }))}
                      />
                    )}
                    <button
                      type="button"
                      onClick={handleSaveItem}
                      disabled={updateItem.isPending}
                      className="self-start rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {t("save")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
