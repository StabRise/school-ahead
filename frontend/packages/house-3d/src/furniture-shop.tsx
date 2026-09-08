"use client";

import { useMemo, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { ChevronLeft, ChevronRight, Lock, Minus, Plus, Search } from "lucide-react";
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
// `kidsMode` just scales the tile/icon/text up for little hands and eyes —
// see house-scene-store's uiMode.
function ShopItemButton({
  item,
  onBuy,
  onToggleRoom,
  isToggling,
  kidsMode,
}: {
  item: FurnitureItemOut;
  onBuy: () => void;
  onToggleRoom: () => void;
  isToggling: boolean;
  kidsMode: boolean;
}) {
  const t = useTranslations("House");
  const isPlaced = item.placement !== null;
  const tileSize = kidsMode ? "h-32 w-32" : "h-24 w-24";
  const toggleSize = kidsMode ? "h-9 w-9" : "h-6 w-6";
  const iconSize = kidsMode ? "h-5 w-5" : "h-3.5 w-3.5";

  return (
    <div
      className={`relative ${tileSize} shrink-0 snap-start overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors hover:border-gray-300 hover:bg-gray-50`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.thumbnail_image} alt="" className="h-full w-full object-contain" />
      {item.is_owned ? (
        <button
          type="button"
          onClick={onToggleRoom}
          disabled={isToggling}
          title={isPlaced ? t("removeFromRoom") : t("addToRoom")}
          aria-label={isPlaced ? t("removeFromRoom") : t("addToRoom")}
          className={`absolute bottom-1 right-1 flex ${toggleSize} items-center justify-center rounded-full text-white shadow disabled:opacity-60 ${
            isPlaced ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {isPlaced ? <Minus className={iconSize} /> : <Plus className={iconSize} />}
        </button>
      ) : (
        <button
          type="button"
          onClick={onBuy}
          title={`${item.name} — 💎 ${item.price}`}
          className={`absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-white/85 font-bold text-gray-700 ${
            kidsMode ? "text-base" : "text-sm"
          }`}
        >
          <Lock className={iconSize} />
          <span className="tabular-nums">💎{item.price}</span>
        </button>
      )}
    </div>
  );
}

export interface FurnitureShopProps {
  items: FurnitureItemOut[];
  // house-scene-store's uiMode — scales tiles/text up and hides nothing,
  // the market itself (search + scroller) is identical in both modes.
  kidsMode?: boolean;
}

// The furniture market: a search box over a horizontally scrollable strip
// of tiles (with prev/next buttons alongside, for anyone who'd rather click
// than drag-scroll) — see docs/core/avatar.md's wardrobe shop for the
// pattern this mirrors (accounts.AvatarItem/AvatarWardrobe), applied to
// house.FurnitureItem instead. Buying a piece only grants ownership (no
// separate equip step, but also no auto-placement — see
// house.services.purchase_item); the student then uses the Add/Remove
// toggle to put an owned piece in the room or take it out.
export function FurnitureShop({ items, kidsMode = false }: FurnitureShopProps) {
  const t = useTranslations("House");
  const queryClient = useQueryClient();
  const purchaseItem = usePurchaseFurnitureItem();
  const placeItem = usePlaceFurnitureItem();
  const clearPlacement = useClearFurniturePlacement();
  const [pendingPurchase, setPendingPurchase] = useState<FurnitureItemOut | null>(null);
  const [notEnoughDiamonds, setNotEnoughDiamonds] = useState<{ itemName: string; price: number } | null>(null);
  const [search, setSearch] = useState("");
  const diamondBalance = useAuthStore((state) => state.user?.diamondBalance ?? 0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.name.toLowerCase().includes(query));
  }, [items, search]);

  const scrollBy = (delta: number) => scrollerRef.current?.scrollBy({ left: delta, behavior: "smooth" });

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={kidsMode ? "text-xl font-bold text-gray-800" : "text-sm font-semibold text-gray-700"}>
          {kidsMode ? `🛍️ ${t("shopTitle")}` : t("shopTitle")}
        </h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className={`rounded-full border border-gray-300 pl-8 pr-3 focus:border-gray-400 focus:outline-none ${
              kidsMode ? "h-10 w-48 text-base" : "h-8 w-40 text-sm"
            }`}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => scrollBy(-240)}
          aria-label={t("scrollLeft")}
          className="hidden shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-50 sm:flex"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div ref={scrollerRef} className="flex flex-1 snap-x gap-2 overflow-x-auto scroll-smooth pb-2">
          {filteredItems.map((item) => (
            <ShopItemButton
              key={item.id}
              item={item}
              kidsMode={kidsMode}
              onBuy={() => handleClick(item)}
              onToggleRoom={() => handleToggleRoom(item)}
              isToggling={placeItem.isPending || clearPlacement.isPending}
            />
          ))}
          {filteredItems.length === 0 && <p className="py-6 text-sm text-gray-500">{t("noSearchResults")}</p>}
        </div>

        <button
          type="button"
          onClick={() => scrollBy(240)}
          aria-label={t("scrollRight")}
          className="hidden shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-50 sm:flex"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
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
