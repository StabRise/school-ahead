"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, useUpdateAvatarItems } from "@/lib/api/browser/auth/auth";
import { mapApiUserToAuthUser } from "@/lib/api/map-user";
import { useAuthStore, type EquippedAvatarItem } from "@/stores/auth-store";

const SLOTS = ["clothing", "headwear", "accessory"] as const;

// Wardrobe pickers for the equipped avatar's clothing/headwear/accessory
// slots — see docs/core/avatar.md section 2.2. Each slot equips at most one
// item at a time (re-selecting the active one, or picking "none", unequips
// it); the mutation always sends the full three-slot state (see
// UpdateAvatarItemsIn on the backend).
export function AvatarWardrobe() {
  const t = useTranslations("Profile");
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const updateItems = useUpdateAvatarItems();

  const items = user?.equippedAvatar?.items ?? [];
  const equippedBySlot: Record<(typeof SLOTS)[number], EquippedAvatarItem | null> = {
    clothing: user?.equippedClothing ?? null,
    headwear: user?.equippedHeadwear ?? null,
    accessory: user?.equippedAccessory ?? null,
  };

  const handleSelect = (slot: (typeof SLOTS)[number], itemId: number | null) => {
    if (updateItems.isPending || equippedBySlot[slot]?.id === itemId) return;
    updateItems.mutate(
      {
        data: {
          clothing_item_id: slot === "clothing" ? itemId : (equippedBySlot.clothing?.id ?? null),
          headwear_item_id: slot === "headwear" ? itemId : (equippedBySlot.headwear?.id ?? null),
          accessory_item_id: slot === "accessory" ? itemId : (equippedBySlot.accessory?.id ?? null),
        },
      },
      {
        onSuccess: (response) => {
          setUser(mapApiUserToAuthUser(response.user));
          queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
        },
      },
    );
  };

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {SLOTS.map((slot) => {
        const slotItems = items.filter((item) => item.slot === slot);
        if (slotItems.length === 0) return null;
        const equippedId = equippedBySlot[slot]?.id ?? null;

        return (
          <div key={slot} className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold text-gray-700">{t(`wardrobeSlot.${slot}`)}</h4>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleSelect(slot, null)}
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
                    onClick={() => handleSelect(slot, item.id)}
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
