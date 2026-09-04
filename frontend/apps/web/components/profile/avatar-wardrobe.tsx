"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { ChevronDown, ChevronUp, Lock } from "lucide-react";
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
  isPreschool,
  onClick,
}: {
  item: EquippedAvatarItem;
  isSelected: boolean;
  disabled: boolean;
  isPreschool: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={item.isUnlocked ? isSelected : undefined}
      title={item.isUnlocked ? item.name : `${item.name} — 💎 ${item.price}`}
      className={`relative flex items-center justify-center overflow-hidden rounded-lg border bg-white transition-colors disabled:cursor-default disabled:opacity-60 ${
        isPreschool ? "h-20 w-20 sm:h-24 sm:w-24" : "h-14 w-14"
      } ${
        item.isUnlocked && isSelected
          ? isPreschool
            ? "border-4 border-emerald-400 bg-emerald-50"
            : "border-gray-900 bg-gray-900/5"
          : isPreschool
            ? "border-2 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50"
            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt="" className="h-full w-full object-contain" />
      ) : null}
      {!item.isUnlocked && (
        <span
          className={`absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-white/85 font-bold text-gray-700 ${
            isPreschool ? "gap-1 text-xl" : "text-sm"
          }`}
        >
          <Lock className={isPreschool ? "h-6 w-6" : "h-3.5 w-3.5"} />
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
  const isPreschool = user?.interfaceMode === "preschool";
  const setUser = useAuthStore((state) => state.setUser);
  const tryOnItem = useAvatarTryOnStore((state) => state.tryOnItem);
  const setTryOnItem = useAvatarTryOnStore((state) => state.setTryOnItem);
  const queryClient = useQueryClient();
  const updateItems = useUpdateAvatarItems();
  const purchaseItem = usePurchaseAvatarItem();
  const [notEnoughDiamonds, setNotEnoughDiamonds] = useState<{ itemName: string; price: number } | null>(null);
  // Accordion: one slot's items shown at a time (`null` = default to the
  // first non-empty slot, not "everything collapsed") — three fully-
  // expanded grids, especially at the bigger preschool tile size, made the
  // page too long/cluttered to scan at a glance.
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);

  // Never leave a stray try-on preview showing elsewhere in the app if the
  // student navigates away mid-decision.
  useEffect(() => () => setTryOnItem(null), [setTryOnItem]);

  const items = user?.equippedAvatar?.items ?? [];
  // Ordered, not just membership: the API now returns each slot's items
  // pre-sorted by the student's own stacking-order override (falling back to
  // the catalog's layer_order) — see docs/core/avatar.md §2.2 and
  // backend accounts.api._equipped_items_out. Sending these ids back in the
  // same order is how PATCH /me/avatar-items also doubles as the reorder
  // endpoint (save_equipped_item_order), so array order here is meaningful,
  // not just which ids are present.
  const equippedIdsBySlot: Record<Slot, number[]> = {
    clothing: (user?.equippedClothingItems ?? []).map((item) => item.id),
    headwear: (user?.equippedHeadwearItems ?? []).map((item) => item.id),
    accessory: (user?.equippedAccessoryItems ?? []).map((item) => item.id),
  };
  const isBusy = updateItems.isPending || purchaseItem.isPending;

  const save = (nextIdsBySlot: Record<Slot, number[]>) => {
    updateItems.mutate(
      {
        data: {
          clothing_item_ids: nextIdsBySlot.clothing,
          headwear_item_ids: nextIdsBySlot.headwear,
          accessory_item_ids: nextIdsBySlot.accessory,
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
    const next = current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId];
    save({ ...equippedIdsBySlot, [slot]: next });
  };

  const handleClear = (slot: Slot) => {
    if (isBusy || equippedIdsBySlot[slot].length === 0) return;
    save({ ...equippedIdsBySlot, [slot]: [] });
  };

  const handleMove = (slot: Slot, itemId: number, direction: "up" | "down") => {
    if (isBusy) return;
    const current = equippedIdsBySlot[slot];
    const index = current.indexOf(itemId);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapWith < 0 || swapWith >= current.length) return;
    const next = [...current];
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    save({ ...equippedIdsBySlot, [slot]: next });
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

  const visibleSlots = SLOTS.filter((slot) => items.some((item) => item.slot === slot));
  const effectiveOpenSlot = openSlot ?? visibleSlots[0] ?? null;

  return (
    <div className="flex flex-col gap-3">
      {visibleSlots.map((slot) => {
        const slotItems = items.filter((item) => item.slot === slot);
        const equippedIds = equippedIdsBySlot[slot];
        const isOpen = effectiveOpenSlot === slot;

        return (
          <div
            key={slot}
            className={`overflow-hidden rounded-2xl border ${isPreschool ? "border-2 border-gray-200" : "border-gray-200"}`}
          >
            <button
              type="button"
              onClick={() => setOpenSlot(isOpen ? null : slot)}
              aria-expanded={isOpen}
              className={`flex w-full items-center justify-between gap-2 bg-gray-50 px-4 font-semibold text-gray-700 transition-colors hover:bg-gray-100 ${
                isPreschool ? "py-4 text-xl" : "py-2.5 text-sm"
              }`}
            >
              {t(`wardrobeSlot.${slot}`)}
              <ChevronDown
                className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""} ${isPreschool ? "h-6 w-6" : "h-4 w-4"}`}
              />
            </button>

            {isOpen && (
              <>
                {equippedIds.length >= 2 && (
                  <div className={`flex flex-col border-b border-gray-100 ${isPreschool ? "gap-2 p-4" : "gap-1.5 p-3"}`}>
                    <span className={`font-semibold text-gray-500 ${isPreschool ? "text-base" : "text-xs"}`}>
                      {t("wardrobeStackOrderLabel")}
                    </span>
                    {equippedIds.map((itemId, index) => {
                      const item = slotItems.find((candidate) => candidate.id === itemId);
                      if (!item) return null;
                      return (
                        <div
                          key={itemId}
                          className={`flex items-center gap-2 rounded-lg border border-gray-200 bg-white ${isPreschool ? "p-2" : "p-1.5"}`}
                        >
                          <span
                            className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-50 ${isPreschool ? "h-12 w-12" : "h-8 w-8"}`}
                          >
                            {item.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.image} alt="" className="h-full w-full object-contain" />
                            ) : null}
                          </span>
                          <span className={`flex-1 truncate font-medium text-gray-700 ${isPreschool ? "text-base" : "text-xs"}`}>
                            {item.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleMove(slot, itemId, "up")}
                            disabled={isBusy || index === 0}
                            aria-label={t("wardrobeMoveUp")}
                            className={`flex shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-default disabled:opacity-40 ${
                              isPreschool ? "h-10 w-10" : "h-7 w-7"
                            }`}
                          >
                            <ChevronUp className={isPreschool ? "h-5 w-5" : "h-4 w-4"} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMove(slot, itemId, "down")}
                            disabled={isBusy || index === equippedIds.length - 1}
                            aria-label={t("wardrobeMoveDown")}
                            className={`flex shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-default disabled:opacity-40 ${
                              isPreschool ? "h-10 w-10" : "h-7 w-7"
                            }`}
                          >
                            <ChevronDown className={isPreschool ? "h-5 w-5" : "h-4 w-4"} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className={`flex flex-wrap p-4 ${isPreschool ? "gap-3" : "gap-2"}`}>
                  <button
                    type="button"
                    onClick={() => handleClear(slot)}
                    disabled={isBusy}
                    aria-pressed={equippedIds.length === 0}
                    className={`flex items-center justify-center rounded-lg border text-gray-500 transition-colors disabled:cursor-default disabled:opacity-60 ${
                      isPreschool ? "h-20 w-20 text-sm sm:h-24 sm:w-24" : "h-14 w-14 text-xs"
                    } ${
                      equippedIds.length === 0
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
                      isSelected={equippedIds.includes(item.id)}
                      disabled={isBusy}
                      isPreschool={isPreschool}
                      onClick={() => (item.isUnlocked ? handleToggle(slot, item.id) : handleTryOn(item))}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}

      <ConfirmPurchaseDialog
        open={tryOnItem !== null && notEnoughDiamonds === null}
        onOpenChange={(open) => !open && handleCancelTryOn()}
        itemName={tryOnItem?.name ?? ""}
        price={tryOnItem?.price ?? 0}
        isPending={purchaseItem.isPending}
        isPreschool={isPreschool}
        onConfirm={handleConfirmPurchase}
      />

      <NotEnoughDiamondsDialog
        open={notEnoughDiamonds !== null}
        onOpenChange={(open) => !open && handleCloseNotEnoughDiamonds()}
        itemName={notEnoughDiamonds?.itemName ?? ""}
        price={notEnoughDiamonds?.price ?? 0}
        balance={user?.diamondBalance ?? 0}
        isPreschool={isPreschool}
      />
    </div>
  );
}
