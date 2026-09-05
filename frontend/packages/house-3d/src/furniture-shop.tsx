"use client";

import { useState } from "react";
import { isAxiosError } from "axios";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@school-ahead/api-client";
import { getMeQueryKey } from "@school-ahead/api-client/browser/auth/auth";
import {
  getListFurnitureCatalogQueryKey,
  usePurchaseFurnitureItem,
} from "@school-ahead/api-client/browser/house/house";
import type { FurnitureItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { ConfirmPurchaseDialog } from "./confirm-purchase-dialog";
import { NotEnoughDiamondsDialog } from "./not-enough-diamonds-dialog";

function ShopItemButton({
  item,
  onClick,
}: {
  item: FurnitureItemOut;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={item.is_owned ? item.name : `${item.name} — 💎 ${item.price}`}
      className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors hover:border-gray-300 hover:bg-gray-50"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.thumbnail_image} alt="" className="h-full w-full object-contain" />
      {!item.is_owned && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-white/85 text-sm font-bold text-gray-700">
          <Lock className="h-3.5 w-3.5" />
          <span className="tabular-nums">💎{item.price}</span>
        </span>
      )}
    </button>
  );
}

// The furniture shop grid — see docs/core/avatar.md's wardrobe shop for
// the pattern this mirrors (accounts.AvatarItem/AvatarWardrobe), applied to
// house.FurnitureItem instead. Buying a piece immediately places it in the
// room (no separate equip step — see house.services.purchase_item), so a
// successful purchase here is reflected the next time `items` refreshes.
export function FurnitureShop({ items }: { items: FurnitureItemOut[] }) {
  const t = useTranslations("House");
  const queryClient = useQueryClient();
  const purchaseItem = usePurchaseFurnitureItem();
  const [pendingPurchase, setPendingPurchase] = useState<FurnitureItemOut | null>(null);
  const [notEnoughDiamonds, setNotEnoughDiamonds] = useState<{ itemName: string; price: number } | null>(null);
  const diamondBalance = useAuthStore((state) => state.user?.diamondBalance ?? 0);

  const handleClick = (item: FurnitureItemOut) => {
    if (item.is_owned || purchaseItem.isPending) return;
    setPendingPurchase(item);
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
          <ShopItemButton key={item.id} item={item} onClick={() => handleClick(item)} />
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
