"use client";

import { useEffect, useState, type ReactNode } from "react";
import { isAxiosError } from "axios";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, usePurchaseAvatarItem, useUpdateAvatarItems } from "@school-ahead/api-client/browser/auth/auth";
import { mapApiUserToAuthUser } from "@school-ahead/api-client";
import { useAuthStore, type AuthUser, type EquippedAvatarItem } from "@school-ahead/api-client";
import { useAvatarTryOnStore } from "./avatar-tryon-store";
import { ConfirmPurchaseDialog } from "./confirm-purchase-dialog";
import { NotEnoughDiamondsDialog } from "./not-enough-diamonds-dialog";

type Slot = "clothing" | "headwear" | "accessory";

// Top-to-bottom shelf order requested for the preschool closet/shop: hats
// up high, clothing at eye level, accessories on the low shelf — not the
// clothing/headwear/accessory order AvatarWardrobe iterates in elsewhere,
// which is just catalog declaration order and was never meant to imply a
// physical arrangement.
const SLOT_ORDER: Slot[] = ["headwear", "clothing", "accessory"];

function getEquippedIdsBySlot(user: AuthUser | null | undefined): Record<Slot, number[]> {
  return {
    clothing: (user?.equippedClothingItems ?? []).map((item) => item.id),
    headwear: (user?.equippedHeadwearItems ?? []).map((item) => item.id),
    accessory: (user?.equippedAccessoryItems ?? []).map((item) => item.id),
  };
}

// One physical shelf: a wood plank under a wrapping row of items, no
// bordered box around anything sitting on it — the whole point of this
// file versus AvatarWardrobe's bordered-tile grid (see this feature's own
// request: real shelves, not "scary rounded squares everywhere").
function Shelf({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="px-1 text-sm font-bold uppercase tracking-wide text-amber-900/70">{label}</span>
      <div className="relative pb-3">
        <div className="flex min-h-20 flex-wrap items-end gap-1 px-1 sm:min-h-24">{children}</div>
        <div className="absolute inset-x-0 bottom-0 h-2.5 rounded-full bg-gradient-to-b from-amber-700 to-amber-900 shadow-[0_3px_4px_rgba(120,53,15,0.45)]" />
      </div>
    </div>
  );
}

// An owned item on "Мої речі" — bright and slightly enlarged when
// currently worn, dimmed when just owned-but-not-worn, a small checkmark
// badge instead of a border to show which state it's in.
function MyItemButton({
  item,
  isEquipped,
  disabled,
  onClick,
}: {
  item: EquippedAvatarItem;
  isEquipped: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isEquipped}
      title={item.name}
      className="relative flex h-20 w-20 shrink-0 items-center justify-center transition-transform hover:scale-110 disabled:cursor-default disabled:opacity-60 sm:h-24 sm:w-24"
    >
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image}
          alt=""
          className={`h-full w-full object-contain drop-shadow-md transition ${
            isEquipped ? "scale-110" : "opacity-60 grayscale-[40%]"
          }`}
        />
      ) : null}
      {isEquipped && (
        <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs text-white shadow">
          ✓
        </span>
      )}
    </button>
  );
}

// A not-yet-bought item in the shop — the price tag sits in the bottom-
// right corner of the item itself, per this feature's own request, not
// centered over a lock icon like AvatarWardrobe's adult tile does.
function ShopItemButton({
  item,
  disabled,
  onClick,
}: {
  item: EquippedAvatarItem;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${item.name} — 💎 ${item.price}`}
      className="relative flex h-20 w-20 shrink-0 items-center justify-center transition-transform hover:scale-110 disabled:cursor-default disabled:opacity-60 sm:h-24 sm:w-24"
    >
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt="" className="h-full w-full object-contain drop-shadow-md" />
      ) : null}
      <span className="absolute -bottom-1 -right-1 rounded-full bg-white px-1.5 py-0.5 text-xs font-extrabold tabular-nums text-amber-700 shadow ring-2 ring-amber-300">
        💎{item.price}
      </span>
    </button>
  );
}

// The "шафка" (cabinet) frame for PreschoolMyItems — three fixed shelves,
// not an accordion: everything the child already owns should be visible
// and reachable in one glance, not hidden behind a tap.
function Closet({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border-4 border-amber-800 bg-amber-50/80 p-4 shadow-inner">
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  );
}

// The shop's "домик" (little house) frame — a roof (a full-width triangle
// via clip-path, scaling with the box instead of a fixed-size CSS-border
// triangle) over the same shelves-of-items layout Closet uses, so the
// item/shelf visuals stay identical between "my things" and "shop" and
// only the outer frame differs.
function ShopHouse({ children }: { children: ReactNode }) {
  return (
    <div>
      <div className="h-10 w-full bg-red-500 [clip-path:polygon(50%_0%,100%_100%,0%_100%)] sm:h-14" />
      <div className="-mt-px rounded-b-2xl border-4 border-t-0 border-amber-800 bg-amber-50/80 p-4 shadow-inner">
        <div className="flex flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}

// "Мої речі" — the preschool profile's own equip/unequip picker, replacing
// AvatarWardrobe there (see profile-view.tsx): every owned item on its
// slot's shelf inside one cabinet, always visible (no accordion), tap to
// wear/take off. Not-yet-bought items live in PreschoolAvatarShop instead —
// this only ever shows items the student already has.
export function PreschoolMyItems() {
  const t = useTranslations("Profile");
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const updateItems = useUpdateAvatarItems();

  const ownedItems = (user?.equippedAvatar?.items ?? []).filter((item) => item.isUnlocked);
  const equippedIdsBySlot = getEquippedIdsBySlot(user);
  const visibleSlots = SLOT_ORDER.filter((slot) => ownedItems.some((item) => item.slot === slot));

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
    if (updateItems.isPending) return;
    const current = equippedIdsBySlot[slot];
    const next = current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId];
    save({ ...equippedIdsBySlot, [slot]: next });
  };

  if (visibleSlots.length === 0) return null;

  return (
    <Closet>
      {visibleSlots.map((slot) => (
        <Shelf key={slot} label={t(`wardrobeSlot.${slot}`)}>
          {ownedItems
            .filter((item) => item.slot === slot)
            .map((item) => (
              <MyItemButton
                key={item.id}
                item={item}
                isEquipped={equippedIdsBySlot[slot].includes(item.id)}
                disabled={updateItems.isPending}
                onClick={() => handleToggle(slot, item.id)}
              />
            ))}
        </Shelf>
      ))}
    </Closet>
  );
}

// "Магазин" — the preschool profile's shop, shown separately from the
// closet above (not merged into the same shelves): every not-yet-bought
// item, priced, inside a little house frame. Tapping one "tries it on"
// (same flow AvatarWardrobe's adult shop uses) and asks to confirm the
// purchase; buying it equips it immediately.
export function PreschoolAvatarShop() {
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
  // student navigates away mid-decision — same guard as AvatarWardrobe's.
  useEffect(() => () => setTryOnItem(null), [setTryOnItem]);

  const shopItems = (user?.equippedAvatar?.items ?? []).filter((item) => !item.isUnlocked);
  const equippedIdsBySlot = getEquippedIdsBySlot(user);
  const visibleSlots = SLOT_ORDER.filter((slot) => shopItems.some((item) => item.slot === slot));
  const isBusy = updateItems.isPending || purchaseItem.isPending;

  const equipItem = (slot: Slot, itemId: number) => {
    const current = equippedIdsBySlot[slot];
    if (current.includes(itemId)) return;
    updateItems.mutate({
      data: {
        clothing_item_ids: slot === "clothing" ? [...current, itemId] : equippedIdsBySlot.clothing,
        headwear_item_ids: slot === "headwear" ? [...current, itemId] : equippedIdsBySlot.headwear,
        accessory_item_ids: slot === "accessory" ? [...current, itemId] : equippedIdsBySlot.accessory,
      },
    });
  };

  const handleTryOn = (item: EquippedAvatarItem) => {
    if (isBusy) return;
    setTryOnItem(item);
  };

  const handleCancelTryOn = () => setTryOnItem(null);

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
          equipItem(item.slot, item.id);
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

  if (visibleSlots.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-2xl font-extrabold text-emerald-900">{t("shopTitle")}</h3>
      <ShopHouse>
        {visibleSlots.map((slot) => (
          <Shelf key={slot} label={t(`wardrobeSlot.${slot}`)}>
            {shopItems
              .filter((item) => item.slot === slot)
              .map((item) => (
                <ShopItemButton key={item.id} item={item} disabled={isBusy} onClick={() => handleTryOn(item)} />
              ))}
          </Shelf>
        ))}
      </ShopHouse>

      <ConfirmPurchaseDialog
        open={tryOnItem !== null && notEnoughDiamonds === null}
        onOpenChange={(open) => !open && handleCancelTryOn()}
        itemName={tryOnItem?.name ?? ""}
        price={tryOnItem?.price ?? 0}
        isPending={purchaseItem.isPending}
        isPreschool
        onConfirm={handleConfirmPurchase}
      />

      <NotEnoughDiamondsDialog
        open={notEnoughDiamonds !== null}
        onOpenChange={(open) => !open && handleCloseNotEnoughDiamonds()}
        itemName={notEnoughDiamonds?.itemName ?? ""}
        price={notEnoughDiamonds?.price ?? 0}
        balance={user?.diamondBalance ?? 0}
        isPreschool
      />
    </div>
  );
}
