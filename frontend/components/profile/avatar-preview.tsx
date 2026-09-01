"use client";

import { EquippedAvatarLayers, itemsToLayers, useEquippedAvatarLayers } from "@/components/equipped-avatar";
import { useAvatarTryOnStore } from "@/stores/avatar-tryon-store";

// Full-size composited preview of the student's equipped avatar (body ->
// clothing -> headwear -> accessory), plus a not-yet-purchased item being
// tried on — see docs/core/avatar.md section 2. See
// components/equipped-avatar.tsx for the shared layering logic this and
// every other companion frame (header, preschool calendar/game map) build
// on.
export function AvatarPreview() {
  const equippedLayers = useEquippedAvatarLayers();
  const tryOnItem = useAvatarTryOnStore((state) => state.tryOnItem);

  const layers = [
    ...equippedLayers,
    // A not-yet-purchased item being tried on renders last (on top of
    // everything) so it's never hidden behind what's already equipped —
    // see components/profile/avatar-wardrobe.tsx's purchase-confirm flow.
    ...itemsToLayers(tryOnItem ? [tryOnItem] : undefined),
  ];

  return (
    <div className="aspect-square w-100 shrink-0 rounded-xl bg-gray-100 p-8">
      <EquippedAvatarLayers layers={layers} />
    </div>
  );
}
