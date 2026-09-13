"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AvatarPlacementEditor, type AvatarTransform } from "./avatar-placement-editor";
import { itemsToLayers, useEquippedAvatarLayers } from "./equipped-avatar";
import {
  getMeQueryKey,
  useResetAvatarItemPlacement,
  useUpdateAvatarItemPlacement,
  useUpdateAvatarItems,
} from "@school-ahead/api-client/browser/auth/auth";
import { mapApiUserToAuthUser } from "@school-ahead/api-client";
import { useAuthStore, type EquippedAvatarItem } from "@school-ahead/api-client";
import { useAvatarTryOnStore } from "./avatar-tryon-store";

// Full-size composited preview of the student's equipped avatar (body ->
// clothing -> headwear -> accessory), plus a not-yet-purchased item being
// tried on — see docs/core/avatar.md section 2. The actual click-to-select/
// drag/rotate/resize canvas is this package's own AvatarPlacementEditor —
// the same component the tutor's avatar-item catalog editor
// (tutor-avatar-editor-page.tsx) uses to edit an item's default placement.
// This wrapper only supplies what's specific to "the signed-in student
// editing their own equipped items": the layer data, the per-item placement
// PATCH (EquippedItemPlacement on the backend, private to this student —
// never applied to any other viewer of their avatar), reset-to-default, and
// unequip-via-Delete-key.
export function AvatarPreview() {
  const user = useAuthStore((state) => state.user);
  const isPreschool = user?.interfaceMode === "preschool";
  const setUser = useAuthStore((state) => state.setUser);
  const tryOnItem = useAvatarTryOnStore((state) => state.tryOnItem);
  const queryClient = useQueryClient();
  const updatePlacement = useUpdateAvatarItemPlacement();
  const resetPlacement = useResetAvatarItemPlacement();
  const updateItems = useUpdateAvatarItems();

  const equippedLayers = useEquippedAvatarLayers();
  const tryOnLayers = itemsToLayers(tryOnItem ? [tryOnItem] : undefined);
  const layers = [...equippedLayers, ...tryOnLayers];

  const equippedItems: EquippedAvatarItem[] = [
    ...(user?.equippedClothingItems ?? []),
    ...(user?.equippedHeadwearItems ?? []),
    ...(user?.equippedAccessoryItems ?? []),
  ];
  const equippedItemsById = new Map(equippedItems.map((item) => [item.id, item]));

  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  const invalidateAndSetUser = (apiUser: Parameters<typeof mapApiUserToAuthUser>[0]) => {
    setUser(mapApiUserToAuthUser(apiUser));
    queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
  };

  const handleCommit = (itemId: number, next: AvatarTransform) => {
    updatePlacement.mutate(
      { itemId, data: { offset_x: next.offsetX, offset_y: next.offsetY, rotation: next.rotation, scale: next.scale } },
      { onSuccess: (response) => invalidateAndSetUser(response.user) },
    );
  };

  const handleResetPlacement = () => {
    if (selectedItemId === null || updatePlacement.isPending || resetPlacement.isPending) return;
    resetPlacement.mutate({ itemId: selectedItemId }, { onSuccess: (response) => invalidateAndSetUser(response.user) });
  };

  // Unequips the selected item (Delete/Backspace — see the keydown effect
  // below), same PATCH /me/avatar-items call AvatarWardrobe's own toggle
  // uses, just computed from the currently-selected item instead of a
  // wardrobe-grid click. Purely an equip-state change — the item stays
  // unlocked/purchased (see docs/core/avatar.md section 2.2), just no
  // longer worn, and it keeps its own EquippedItemPlacement/
  // EquippedItemOrder rows for if it's ever re-equipped.
  const handleUnequipSelected = () => {
    if (selectedItemId === null || updateItems.isPending) return;
    const item = equippedItemsById.get(selectedItemId);
    if (!item) return;
    const idsBySlot = {
      clothing: (user?.equippedClothingItems ?? []).map((candidate) => candidate.id),
      headwear: (user?.equippedHeadwearItems ?? []).map((candidate) => candidate.id),
      accessory: (user?.equippedAccessoryItems ?? []).map((candidate) => candidate.id),
    };
    idsBySlot[item.slot] = idsBySlot[item.slot].filter((id) => id !== item.id);
    updateItems.mutate(
      {
        data: {
          clothing_item_ids: idsBySlot.clothing,
          headwear_item_ids: idsBySlot.headwear,
          accessory_item_ids: idsBySlot.accessory,
        },
      },
      {
        onSuccess: (response) => {
          invalidateAndSetUser(response.user);
          setSelectedItemId(null);
        },
      },
    );
  };

  // Kept in a ref (rather than listed in the effect's deps below) so the
  // keydown listener isn't torn down and re-attached on every render —
  // only when selection actually toggles on/off — while still calling the
  // latest closure (freshest equippedItemsById/user) when Delete fires.
  const handleUnequipSelectedRef = useRef(handleUnequipSelected);
  useEffect(() => {
    handleUnequipSelectedRef.current = handleUnequipSelected;
  });

  // Delete/Backspace unequips whichever wardrobe item is currently
  // selected — only wired up while something IS selected, so it can't
  // steal Delete/Backspace from an unrelated focused input elsewhere on
  // the page the rest of the time.
  useEffect(() => {
    if (selectedItemId === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      e.preventDefault();
      handleUnequipSelectedRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedItemId]);

  return (
    <AvatarPlacementEditor
      layers={layers}
      activeItemId={selectedItemId}
      onActiveItemChange={setSelectedItemId}
      onCommit={handleCommit}
      isPending={updatePlacement.isPending || resetPlacement.isPending}
      resetButton={{ onReset: handleResetPlacement, isPending: resetPlacement.isPending }}
      frameClassName={`aspect-square w-100 shrink-0 overflow-hidden rounded-xl px-8 pb-8 pt-14 ${
        isPreschool ? "bg-gradient-to-br from-sky-100 via-emerald-50 to-lime-100 ring-4 ring-white shadow-lg" : "bg-gray-100"
      }`}
    />
  );
}
