"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, useUpdateAvatarItemOrder } from "@school-ahead/api-client/browser/auth/auth";
import { mapApiUserToAuthUser } from "@school-ahead/api-client";
import { useAuthStore, type EquippedAvatarItem } from "@school-ahead/api-client";

// A single flat reorder list spanning every currently-equipped item at
// once, regardless of slot — stacking order is global (docs/core/avatar.md
// section 2.2: an accessory can be told to draw under a piece of clothing,
// not just reordered among other accessories). Edited as a separate action
// from AvatarWardrobe's shop/equip-toggle grid (PATCH /me/avatar-items/
// order, distinct from equipping/unequipping) — rendered below
// AvatarPreview on profile-page.tsx rather than inside AvatarWardrobe,
// since it changes *drawing* order, not *which* items are worn.
export function AvatarLayerOrder() {
  const t = useTranslations("Profile");
  const user = useAuthStore((state) => state.user);
  const isPreschool = user?.interfaceMode === "preschool";
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const updateOrder = useUpdateAvatarItemOrder();

  // Each slot already comes back pre-sorted by the item's effective global
  // rank (accounts.services.equipped_items_out) — merging these three
  // already-sorted lists by that same field (layerOrder) is enough to get
  // one globally-correct order, the same merge useEquippedAvatarLayers does
  // for rendering.
  const items: EquippedAvatarItem[] = [
    ...(user?.equippedClothingItems ?? []),
    ...(user?.equippedHeadwearItems ?? []),
    ...(user?.equippedAccessoryItems ?? []),
  ].sort((a, b) => a.layerOrder - b.layerOrder);

  if (items.length < 2) return null;

  const handleMove = (itemId: number, direction: "up" | "down") => {
    if (updateOrder.isPending) return;
    const index = items.findIndex((item) => item.id === itemId);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapWith < 0 || swapWith >= items.length) return;
    const nextIds = items.map((item) => item.id);
    [nextIds[index], nextIds[swapWith]] = [nextIds[swapWith], nextIds[index]];
    updateOrder.mutate(
      { data: { item_ids: nextIds } },
      {
        onSuccess: (response) => {
          setUser(mapApiUserToAuthUser(response.user));
          queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
        },
      },
    );
  };

  return (
    <div
      className={`flex w-100 flex-col rounded-2xl border border-gray-200 ${isPreschool ? "gap-2 p-4" : "gap-1.5 p-3"}`}
    >
      <span className={`font-semibold text-gray-500 ${isPreschool ? "text-base" : "text-xs"}`}>
        {t("wardrobeStackOrderLabel")}
      </span>
      {items.map((item, index) => (
        <div
          key={item.id}
          className={`flex items-center gap-2 rounded-lg border border-gray-200 bg-white ${isPreschool ? "p-2" : "p-1.5"}`}
        >
          <span
            className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-50 ${
              isPreschool ? "h-12 w-12" : "h-8 w-8"
            }`}
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
            onClick={() => handleMove(item.id, "up")}
            disabled={updateOrder.isPending || index === 0}
            aria-label={t("wardrobeMoveUp")}
            className={`flex shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-default disabled:opacity-40 ${
              isPreschool ? "h-10 w-10" : "h-7 w-7"
            }`}
          >
            <ChevronUp className={isPreschool ? "h-5 w-5" : "h-4 w-4"} />
          </button>
          <button
            type="button"
            onClick={() => handleMove(item.id, "down")}
            disabled={updateOrder.isPending || index === items.length - 1}
            aria-label={t("wardrobeMoveDown")}
            className={`flex shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-default disabled:opacity-40 ${
              isPreschool ? "h-10 w-10" : "h-7 w-7"
            }`}
          >
            <ChevronDown className={isPreschool ? "h-5 w-5" : "h-4 w-4"} />
          </button>
        </div>
      ))}
    </div>
  );
}
