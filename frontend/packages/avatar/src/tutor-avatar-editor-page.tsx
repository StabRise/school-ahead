"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import type { AvatarOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import {
  getListTutorAvatarsQueryKey,
  useListTutorAvatars,
  useUpdateTutorAvatarItemTransform,
  useUpdateTutorAvatarTransform,
} from "@school-ahead/api-client/browser/tutor/tutor";
import { AvatarPlacementEditor, type AvatarTransform } from "./avatar-placement-editor";
import { AvatarBadge, type AvatarLayer } from "./equipped-avatar";
import { AvatarEditorSlider } from "./avatar-editor-slider";

const SLOTS = ["clothing", "headwear", "accessory"] as const;

const SCALE_RANGE = { min: 0.3, max: 2.5, step: 0.01 };
const LAYER_ORDER_RANGE = { min: 0, max: 6, step: 1 };
const PRICE_RANGE = { min: 0, max: 500, step: 5 };

// Only layerOrder/price remain here — scale/offsetX/offsetY are edited by
// dragging/resizing directly on the canvas (see AvatarPlacementEditor
// below), auto-saving on release, the same as the student's own avatar
// editor. layerOrder and price aren't spatial and have no drag-handle
// equivalent, so they keep their sliders + an explicit Save button.
interface ItemDraft {
  layerOrder: number;
  price: number;
}

// AvatarBadge's shared "card" frame, not a hand-rolled rounded-full circle —
// a circular mask clips a square/contain-fitted image's corners (ears,
// edges), same bug AvatarPicker had (see its own comment on this).
function AvatarThumb({ avatar }: { avatar: AvatarOut }) {
  return (
    <AvatarBadge
      layers={avatar.image ? [{ itemId: null, image: avatar.image, scale: 1, offsetX: 0, offsetY: 0, rotation: 0 }] : []}
      className="h-12 w-12 shrink-0"
    />
  );
}

// Same interactive placement editor the student's own profile page uses
// (this package's own AvatarPlacementEditor) — click/drag/resize
// here edits an item's *default* placement (what a student gets before they
// customize it themselves), not any particular student's personal override.
// No rotate handle: UpdateAvatarItemTransformIn has no rotation field —
// templates have no rotation concept, only a student's own placement
// override does (see avatar-preview.tsx). No click-to-select either: only
// one item is ever mounted here at a time (the one picked from the slot
// list below), so there's nothing to hit-test against.
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
  const [itemDraft, setItemDraft] = useState<ItemDraft>({ layerOrder: 0, price: 0 });

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
    setItemDraft({ layerOrder: item?.layer_order ?? 0, price: item?.price ?? 0 });
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

  const handleCommitTransform = (itemId: number, next: AvatarTransform) => {
    updateItem.mutate(
      {
        itemId,
        data: {
          scale: next.scale,
          offset_x: next.offsetX,
          offset_y: next.offsetY,
          layer_order: itemDraft.layerOrder,
          price: itemDraft.price,
        },
      },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTutorAvatarsQueryKey() }) },
    );
  };

  const handleSaveItemMeta = () => {
    if (!item) return;
    updateItem.mutate(
      {
        itemId: item.id,
        data: {
          scale: item.scale ?? 1,
          offset_x: item.offset_x ?? 0,
          offset_y: item.offset_y ?? 0,
          layer_order: itemDraft.layerOrder,
          price: itemDraft.price,
        },
      },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTutorAvatarsQueryKey() }) },
    );
  };

  const previewLayers: AvatarLayer[] = [
    ...(avatar?.image ? [{ itemId: null, image: avatar.image, scale: avatarScale, offsetX: 0, offsetY: 0, rotation: 0 }] : []),
    ...(item?.image
      ? [
          {
            itemId: item.id,
            image: item.image,
            scale: item.scale ?? 1,
            offsetX: item.offset_x ?? 0,
            offsetY: item.offset_y ?? 0,
            rotation: item.rotation ?? 0,
          },
        ]
      : []),
  ];

  return (
    // Same shell markup as apps/web's shared PageContainer (title +
    // full-width-until-xl, capped-and-centered-after shell) — duplicated
    // inline rather than imported, since that component lives in apps/web
    // and this page now lives in a portable package.
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8 xl:mx-auto xl:max-w-8xl">
      <h2 className="mb-4 text-xl font-semibold">{t("title")}</h2>
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
                <AvatarPlacementEditor
                  layers={previewLayers}
                  activeItemId={item?.id ?? null}
                  enableClickSelect={false}
                  enableRotate={false}
                  isPending={updateItem.isPending}
                  onCommit={handleCommitTransform}
                  frameClassName="aspect-square w-64 shrink-0 overflow-hidden rounded-xl bg-gray-100 p-8"
                />
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
                              className={`relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border bg-white transition-colors ${
                                candidate.id === selectedItemId
                                  ? "border-gray-900 bg-gray-900/5"
                                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                              }`}
                            >
                              {candidate.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={candidate.image} alt="" className="h-full w-full object-contain" />
                              ) : null}
                              {!!candidate.price && (
                                <span className="absolute bottom-0 right-0 rounded-tl bg-gray-900/80 px-1 text-[9px] font-semibold text-white">
                                  💎{candidate.price}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {item && (
                  <div className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{item.name}</h3>
                      {/* Plain <a>, not a Next.js Link — this package has no
                          dependency on apps/web's locale-aware routing
                          helper. A path missing its locale prefix still
                          resolves correctly (next-intl's middleware
                          redirects to the localized route), just via one
                          extra round-trip. */}
                      <a
                        href={`/tutor/avatars/items/${item.id}/edit`}
                        className="shrink-0 text-xs font-medium text-blue-700 hover:underline"
                      >
                        {t("editArtwork")}
                      </a>
                    </div>
                    <AvatarEditorSlider
                      label={t("layerOrder")}
                      value={itemDraft.layerOrder}
                      {...LAYER_ORDER_RANGE}
                      decimals={0}
                      onChange={(layerOrder) => setItemDraft((d) => ({ ...d, layerOrder }))}
                    />
                    <AvatarEditorSlider
                      label={t("price")}
                      value={itemDraft.price}
                      {...PRICE_RANGE}
                      decimals={0}
                      onChange={(price) => setItemDraft((d) => ({ ...d, price }))}
                    />
                    <button
                      type="button"
                      onClick={handleSaveItemMeta}
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
    </div>
  );
}
