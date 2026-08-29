"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, useUpdateAvatarItems } from "@/lib/api/browser/auth/auth";
import { mapApiUserToAuthUser } from "@/lib/api/map-user";
import { useAuthStore, type EquippedAvatarItem } from "@/stores/auth-store";

const SINGLE_SLOTS = ["headwear", "accessory"] as const;

// Wardrobe pickers for the equipped avatar's wardrobe — see
// docs/core/avatar.md section 2.2. Clothing is multi-select: several pieces
// can be worn together (e.g. a t-shirt + pants + jacket), toggled on/off
// independently and layered by AvatarItem.layer_order in AvatarPreview.
// Headwear/accessory still equip at most one each (re-selecting the active
// one, or picking "none", unequips it). The mutation always sends the full
// wardrobe state (see UpdateAvatarItemsIn on the backend).
export function AvatarWardrobe() {
  const t = useTranslations("Profile");
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const updateItems = useUpdateAvatarItems();

  const items = user?.equippedAvatar?.items ?? [];
  const clothingItems = items.filter((item) => item.slot === "clothing");
  const equippedClothingIds = new Set((user?.equippedClothingItems ?? []).map((item) => item.id));
  const equippedBySingleSlot: Record<(typeof SINGLE_SLOTS)[number], EquippedAvatarItem | null> = {
    headwear: user?.equippedHeadwear ?? null,
    accessory: user?.equippedAccessory ?? null,
  };

  const save = (clothingIds: number[], headwearId: number | null, accessoryId: number | null) => {
    updateItems.mutate(
      { data: { clothing_item_ids: clothingIds, headwear_item_id: headwearId, accessory_item_id: accessoryId } },
      {
        onSuccess: (response) => {
          setUser(mapApiUserToAuthUser(response.user));
          queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
        },
      },
    );
  };

  const handleToggleClothing = (itemId: number) => {
    if (updateItems.isPending) return;
    const nextIds = equippedClothingIds.has(itemId)
      ? [...equippedClothingIds].filter((id) => id !== itemId)
      : [...equippedClothingIds, itemId];
    save(nextIds, equippedBySingleSlot.headwear?.id ?? null, equippedBySingleSlot.accessory?.id ?? null);
  };

  const handleClearClothing = () => {
    if (updateItems.isPending || equippedClothingIds.size === 0) return;
    save([], equippedBySingleSlot.headwear?.id ?? null, equippedBySingleSlot.accessory?.id ?? null);
  };

  const handleSelectSingle = (slot: (typeof SINGLE_SLOTS)[number], itemId: number | null) => {
    if (updateItems.isPending || equippedBySingleSlot[slot]?.id === itemId) return;
    save(
      [...equippedClothingIds],
      slot === "headwear" ? itemId : (equippedBySingleSlot.headwear?.id ?? null),
      slot === "accessory" ? itemId : (equippedBySingleSlot.accessory?.id ?? null),
    );
  };

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {clothingItems.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-gray-700">{t("wardrobeSlot.clothing")}</h4>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleClearClothing}
              disabled={updateItems.isPending}
              aria-pressed={equippedClothingIds.size === 0}
              className={`flex h-14 w-14 items-center justify-center rounded-lg border text-xs text-gray-500 transition-colors disabled:cursor-default disabled:opacity-60 ${
                equippedClothingIds.size === 0
                  ? "border-gray-900 bg-gray-900/5"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {t("wardrobeNone")}
            </button>
            {clothingItems.map((item) => {
              const isSelected = equippedClothingIds.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleToggleClothing(item.id)}
                  disabled={updateItems.isPending}
                  aria-pressed={isSelected}
                  title={item.name}
                  className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border bg-white transition-colors disabled:cursor-default disabled:opacity-60 ${
                    isSelected
                      ? "border-gray-900 bg-gray-900/5"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" className="h-full w-full object-contain" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {SINGLE_SLOTS.map((slot) => {
        const slotItems = items.filter((item) => item.slot === slot);
        if (slotItems.length === 0) return null;
        const equippedId = equippedBySingleSlot[slot]?.id ?? null;

        return (
          <div key={slot} className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold text-gray-700">{t(`wardrobeSlot.${slot}`)}</h4>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleSelectSingle(slot, null)}
                disabled={updateItems.isPending}
                aria-pressed={equippedId === null}
                className={`flex h-14 w-14 items-center justify-center rounded-lg border text-xs text-gray-500 transition-colors disabled:cursor-default disabled:opacity-60 ${
                  equippedId === null
                    ? "border-gray-900 bg-gray-900/5"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {t("wardrobeNone")}
              </button>
              {slotItems.map((item) => {
                const isSelected = equippedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectSingle(slot, item.id)}
                    disabled={updateItems.isPending}
                    aria-pressed={isSelected}
                    title={item.name}
                    className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border bg-white transition-colors disabled:cursor-default disabled:opacity-60 ${
                      isSelected
                        ? "border-gray-900 bg-gray-900/5"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" className="h-full w-full object-contain" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
