"use client";

import { useState } from "react";
import { isAxiosError } from "axios";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, usePurchaseAvatarItem, useUpdateAvatarItems } from "@/lib/api/browser/auth/auth";
import { mapApiUserToAuthUser } from "@/lib/api/map-user";
import { useAuthStore, type EquippedAvatarItem } from "@/stores/auth-store";
import { NotEnoughDiamondsDialog } from "@/components/profile/not-enough-diamonds-dialog";

const SLOTS = ["clothing", "headwear", "accessory"] as const;
type Slot = (typeof SLOTS)[number];

function WardrobeItemButton({
  item,
  isSelected,
  disabled,
  onClick,
}: {
  item: EquippedAvatarItem;
  isSelected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={item.isUnlocked ? isSelected : undefined}
      title={item.isUnlocked ? item.name : `${item.name} — 💎 ${item.price}`}
      className={`relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border bg-white transition-colors disabled:cursor-default disabled:opacity-60 ${
        item.isUnlocked && isSelected
          ? "border-gray-900 bg-gray-900/5"
          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt="" className="h-full w-full object-contain" />
      ) : null}
      {!item.isUnlocked && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-white/85 text-[10px] font-semibold text-gray-700">
          <Lock className="h-3.5 w-3.5" />
          <span className="tabular-nums">💎{item.price}</span>
        </span>
      )}
    </button>
  );
}

// Wardrobe pickers for the equipped avatar's wardrobe — see
// docs/core/avatar.md section 2.2. Every slot (clothing, headwear,
// accessory) is multi-select: several pieces can be worn at once in each —
// a t-shirt + pants + jacket, two hats stacked, glasses + a mask — toggled
// on/off independently and layered by AvatarItem.layer_order in
// AvatarPreview. The mutation always sends the full wardrobe state (see
// UpdateAvatarItemsIn on the backend).
//
// A priced, not-yet-unlocked item shows a lock + price instead of equipping
// on click — clicking it purchases first (docs/core/avatar.md's Diamond
// shop), then equips it immediately on success. Insufficient balance shows
// the "earn more Diamonds" dialog the doc calls for instead of equipping.
export function AvatarWardrobe() {
  const t = useTranslations("Profile");
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const updateItems = useUpdateAvatarItems();
  const purchaseItem = usePurchaseAvatarItem();
  const [notEnoughDiamonds, setNotEnoughDiamonds] = useState<{ itemName: string; price: number } | null>(null);

  const items = user?.equippedAvatar?.items ?? [];
  const equippedIdsBySlot: Record<Slot, Set<number>> = {
    clothing: new Set((user?.equippedClothingItems ?? []).map((item) => item.id)),
    headwear: new Set((user?.equippedHeadwearItems ?? []).map((item) => item.id)),
    accessory: new Set((user?.equippedAccessoryItems ?? []).map((item) => item.id)),
  };
  const isBusy = updateItems.isPending || purchaseItem.isPending;

  const save = (nextIdsBySlot: Record<Slot, Set<number>>) => {
    updateItems.mutate(
      {
        data: {
          clothing_item_ids: [...nextIdsBySlot.clothing],
          headwear_item_ids: [...nextIdsBySlot.headwear],
          accessory_item_ids: [...nextIdsBySlot.accessory],
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

  const handleToggle = (slot: Slot, itemId: number) => {
    if (isBusy) return;
    const current = equippedIdsBySlot[slot];
    const next = new Set(current);
    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }
    save({ ...equippedIdsBySlot, [slot]: next });
  };

  const handleClear = (slot: Slot) => {
    if (isBusy || equippedIdsBySlot[slot].size === 0) return;
    save({ ...equippedIdsBySlot, [slot]: new Set() });
  };

  const handleBuy = (item: EquippedAvatarItem, onUnlocked: () => void) => {
    if (isBusy) return;
    purchaseItem.mutate(
      { itemId: item.id },
      {
        onSuccess: (response) => {
          setUser(mapApiUserToAuthUser(response.user));
          queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
          onUnlocked();
        },
        onError: (error) => {
          if (isAxiosError(error) && error.response?.status === 402) {
            setNotEnoughDiamonds({ itemName: item.name, price: item.price });
          }
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
        const equippedIds = equippedIdsBySlot[slot];

        return (
          <div key={slot} className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold text-gray-700">{t(`wardrobeSlot.${slot}`)}</h4>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleClear(slot)}
                disabled={isBusy}
                aria-pressed={equippedIds.size === 0}
                className={`flex h-14 w-14 items-center justify-center rounded-lg border text-xs text-gray-500 transition-colors disabled:cursor-default disabled:opacity-60 ${
                  equippedIds.size === 0
                    ? "border-gray-900 bg-gray-900/5"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {t("wardrobeNone")}
              </button>
              {slotItems.map((item) => (
                <WardrobeItemButton
                  key={item.id}
                  item={item}
                  isSelected={equippedIds.has(item.id)}
                  disabled={isBusy}
                  onClick={() =>
                    item.isUnlocked ? handleToggle(slot, item.id) : handleBuy(item, () => handleToggle(slot, item.id))
                  }
                />
              ))}
            </div>
          </div>
        );
      })}

      <NotEnoughDiamondsDialog
        open={notEnoughDiamonds !== null}
        onOpenChange={(open) => !open && setNotEnoughDiamonds(null)}
        itemName={notEnoughDiamonds?.itemName ?? ""}
        price={notEnoughDiamonds?.price ?? 0}
        balance={user?.diamondBalance ?? 0}
      />
    </div>
  );
}
