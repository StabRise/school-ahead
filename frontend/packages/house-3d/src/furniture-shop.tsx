"use client";

import { useState } from "react";
import { isAxiosError } from "axios";
import { Lock, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@school-ahead/api-client";
import { getMeQueryKey } from "@school-ahead/api-client/browser/auth/auth";
import {
  getListFurnitureCatalogQueryKey,
  useClearFurniturePlacement,
  usePlaceFurnitureItem,
  usePurchaseFurnitureItem,
} from "@school-ahead/api-client/browser/house/house";
import type { FurnitureItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { ConfirmPurchaseDialog } from "./confirm-purchase-dialog";
import { NotEnoughDiamondsDialog } from "./not-enough-diamonds-dialog";

// Owned items get an Add/Remove toggle instead of the shop auto-placing
// them — buying only grants ownership (see house.services.purchase_item),
// the student decides separately whether a piece is actually in the room.
function ShopItemButton({
  item,
  onBuy,
  onToggleRoom,
  isToggling,
}: {
  item: FurnitureItemOut;
  onBuy: () => void;
  onToggleRoom: () => void;
  isToggling: boolean;
}) {
  const t = useTranslations("House");
  const isPlaced = item.placement !== null;

  return (
    <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors hover:border-gray-300 hover:bg-gray-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.thumbnail_image} alt="" className="h-full w-full object-contain" />
      {item.is_owned ? (
        <button
          type="button"
          onClick={onToggleRoom}
          disabled={isToggling}
          title={isPlaced ? t("removeFromRoom") : t("addToRoom")}
          aria-label={isPlaced ? t("removeFromRoom") : t("addToRoom")}
          className={`absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full text-white shadow disabled:opacity-60 ${
            isPlaced ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {isPlaced ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <button
          type="button"
          onClick={onBuy}
          title={`${item.name} — 💎 ${item.price}`}
          className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-white/85 text-sm font-bold text-gray-700"
        >
          <Lock className="h-3.5 w-3.5" />
          <span className="tabular-nums">💎{item.price}</span>
        </button>
      )}
    </div>
  );
}

// The furniture shop grid — see docs/core/avatar.md's wardrobe shop for
// the pattern this mirrors (accounts.AvatarItem/AvatarWardrobe), applied to
// house.FurnitureItem instead. Buying a piece only grants ownership (no
// separate equip step, but also no auto-placement — see
// house.services.purchase_item); the student then uses the Add/Remove
// toggle to put an owned piece in the room or take it out.
export function FurnitureShop({ items }: { items: FurnitureItemOut[] }) {
  const t = useTranslations("House");
  const queryClient = useQueryClient();
  const purchaseItem = usePurchaseFurnitureItem();
  const placeItem = usePlaceFurnitureItem();
  const clearPlacement = useClearFurniturePlacement();
  const [pendingPurchase, setPendingPurchase] = useState<FurnitureItemOut | null>(null);
  const [notEnoughDiamonds, setNotEnoughDiamonds] = useState<{ itemName: string; price: number } | null>(null);
  const diamondBalance = useAuthStore((state) => state.user?.diamondBalance ?? 0);

  const handleClick = (item: FurnitureItemOut) => {
    if (item.is_owned || purchaseItem.isPending) return;
    setPendingPurchase(item);
  };

  const handleToggleRoom = (item: FurnitureItemOut) => {
    if (placeItem.isPending || clearPlacement.isPending) return;
    const mutation = item.placement !== null ? clearPlacement : placeItem;
    mutation.mutate(
      { itemId: item.id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListFurnitureCatalogQueryKey() }) },
    );
  };

  const handleCloseNotEnoughDiamonds = () => {
    setNotEnoughDiamonds(null);
    setPendingPurchase(null);
  };

  const handleConfirmPurchase = () => {
    if (!pendingPurchase) return;
    const item = pendingPurchase;
    purchaseItem.mutate(
      { itemId: item.id },
      {
        onSuccess: () => {
          useAuthStore.getState().addDiamonds(-item.price);
          queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListFurnitureCatalogQueryKey() });
          setPendingPurchase(null);
        },
        onError: (error) => {
          if (isAxiosError(error) && error.response?.status === 402) {
            setNotEnoughDiamonds({ itemName: item.name, price: item.price });
          }
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-700">{t("shopTitle")}</h2>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <ShopItemButton
            key={item.id}
            item={item}
            onBuy={() => handleClick(item)}
            onToggleRoom={() => handleToggleRoom(item)}
            isToggling={placeItem.isPending || clearPlacement.isPending}
          />
        ))}
      </div>

      <ConfirmPurchaseDialog
        open={pendingPurchase !== null && notEnoughDiamonds === null}
        onOpenChange={(open) => !open && setPendingPurchase(null)}
        itemName={pendingPurchase?.name ?? ""}
        price={pendingPurchase?.price ?? 0}
        isPending={purchaseItem.isPending}
        onConfirm={handleConfirmPurchase}
      />

      <NotEnoughDiamondsDialog
        open={notEnoughDiamonds !== null}
        onOpenChange={(open) => !open && handleCloseNotEnoughDiamonds()}
        itemName={notEnoughDiamonds?.itemName ?? ""}
        price={notEnoughDiamonds?.price ?? 0}
        balance={diamondBalance}
      />
    </div>
  );
}
