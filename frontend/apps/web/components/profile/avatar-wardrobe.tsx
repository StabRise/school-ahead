"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, usePurchaseAvatarItem, useUpdateAvatarItems } from "@school-ahead/api-client/browser/auth/auth";
import { mapApiUserToAuthUser } from "@school-ahead/api-client";
import { useAuthStore, type EquippedAvatarItem } from "@school-ahead/api-client";
import { useAvatarTryOnStore } from "@/stores/avatar-tryon-store";
import { ConfirmPurchaseDialog } from "@/components/profile/confirm-purchase-dialog";
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
// A priced, not-yet-unlocked item is "tried on" instead of equipped on
// click: AvatarPreview shows it live (via useAvatarTryOnStore) while a
// confirm-purchase dialog asks whether to buy it. Confirming buys it, then
// equips it immediately; cancelling reverts the preview with nothing
// charged. Insufficient balance swaps in the "earn more Diamonds" dialog
// the doc calls for, keeping the try-on visible for a beat longer.
export function AvatarWardrobe() {
  const t = useTranslations("Profile");
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const tryOnItem = useAvatarTryOnStore((state) => state.tryOnItem);
  const setTryOnItem = useAvatarTryOnStore((state) => state.setTryOnItem);
  const queryClient = useQueryClient();
  const updateItems = useUpdateAvatarItems();
  const purchaseItem = usePurchaseAvatarItem();
  const [notEnoughDiamonds, setNotEnoughDiamonds] = useState<{ itemName: string; price: number } | null>(null);

  // Never leave a stray try-on preview showing elsewhere in the app if the
  // student navigates away mid-decision.
  useEffect(() => () => setTryOnItem(null), [setTryOnItem]);

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

  const handleTryOn = (item: EquippedAvatarItem) => {
    if (isBusy) return;
    setTryOnItem(item);
  };

  const handleCancelTryOn = () => {
    setTryOnItem(null);
  };

  const handleConfirmPurchase = () => {
    if (!tryOnItem) return;
    const item = tryOnItem;
    purchaseItem.mutate(
      { itemId: item.id },
      {
        onSuccess: (response) => {
          setUser(mapApiUserToAuthUser(response.user));
          queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
          setTryOnItem(null);
          handleToggle(item.slot, item.id);
        },
        onError: (error) => {
          if (isAxiosError(error) && error.response?.status === 402) {
            setNotEnoughDiamonds({ itemName: item.name, price: item.price });
          }
        },
      },
    );
  };

  const handleCloseNotEnoughDiamonds = () => {
    setNotEnoughDiamonds(null);
    setTryOnItem(null);
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
                  onClick={() => (item.isUnlocked ? handleToggle(slot, item.id) : handleTryOn(item))}
                />
              ))}
            </div>
          </div>
        );
      })}

      <ConfirmPurchaseDialog
        open={tryOnItem !== null && notEnoughDiamonds === null}
        onOpenChange={(open) => !open && handleCancelTryOn()}
        itemName={tryOnItem?.name ?? ""}
        price={tryOnItem?.price ?? 0}
        isPending={purchaseItem.isPending}
        onConfirm={handleConfirmPurchase}
      />

      <NotEnoughDiamondsDialog
        open={notEnoughDiamonds !== null}
        onOpenChange={(open) => !open && handleCloseNotEnoughDiamonds()}
        itemName={notEnoughDiamonds?.itemName ?? ""}
        price={notEnoughDiamonds?.price ?? 0}
        balance={user?.diamondBalance ?? 0}
      />
    </div>
  );
}
