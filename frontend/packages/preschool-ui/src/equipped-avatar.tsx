"use client";

import { useAuthStore, type EquippedAvatarItem } from "@school-ahead/api-client";

export interface AvatarLayer {
  // null for the base avatar body layer — every wardrobe item layer carries
  // its AvatarItem id instead, so a consumer (see components/profile/
  // avatar-preview.tsx's interactive editor) can tell which layer came from
  // which equipped item without keeping a second parallel list.
  itemId: number | null;
  image: string;
  scale: number;
  offsetX: number;
  offsetY: number;
  // Degrees, clockwise — a student's own move/rotate override, see
  // EquippedAvatarItem.rotation. Always 0 for the body layer.
  rotation: number;
}

export function itemsToLayers(items: EquippedAvatarItem[] | undefined): AvatarLayer[] {
  return (items ?? [])
    .filter((item) => item.image)
    .map((item) => ({
      itemId: item.id,
      image: item.image as string,
      scale: item.scale,
      offsetX: item.offsetX,
      offsetY: item.offsetY,
      rotation: item.rotation,
    }));
}

// Every layer (body -> clothing -> headwear -> accessory) the signed-in
// student currently has equipped, in draw order — see docs/core/avatar.md
// section 2. Shared by every place that shows the student's companion
// (header, preschool calendar, preschool game map, profile's full
// AvatarPreview) so an equip/purchase change is reflected everywhere, not
// just on the profile page that made it.
export function useEquippedAvatarLayers(): AvatarLayer[] {
  const equippedAvatar = useAuthStore((state) => state.user?.equippedAvatar);
  const equippedClothingItems = useAuthStore((state) => state.user?.equippedClothingItems);
  const equippedHeadwearItems = useAuthStore((state) => state.user?.equippedHeadwearItems);
  const equippedAccessoryItems = useAuthStore((state) => state.user?.equippedAccessoryItems);

  // Stacking order is global across all three slots (a student can put an
  // accessory under a piece of clothing, not just reorder within its own
  // slot — see docs/core/avatar.md section 2.2 and PATCH /me/avatar-items/
  // order) — the backend already returns each item's *effective* rank in
  // `layerOrder` (accounts.services.equipped_items_out), so merge every
  // slot's items together and sort by that one field instead of assuming
  // clothing always draws under headwear under accessory.
  const wardrobeItems = [
    ...(equippedClothingItems ?? []),
    ...(equippedHeadwearItems ?? []),
    ...(equippedAccessoryItems ?? []),
  ].sort((a, b) => a.layerOrder - b.layerOrder);

  return [
    ...(equippedAvatar?.image
      ? [{ itemId: null, image: equippedAvatar.image, scale: equippedAvatar.scale, offsetX: 0, offsetY: 0, rotation: 0 }]
      : []),
    ...itemsToLayers(wardrobeItems),
  ];
}

// Composites `layers` into one absolutely-stacked image pile filling its
// container — the canvas part of what used to be only
// components/profile/avatar-preview.tsx, factored out so the header and
// every preschool companion frame can drop the same clothed avatar into
// their own differently-sized circular frames instead of each duplicating
// (or, previously, skipping) this layering.
export function EquippedAvatarLayers({
  layers,
  className = "",
  crop = true,
}: {
  layers: AvatarLayer[];
  className?: string;
  // A wardrobe item's scale/offsetX/offsetY (see AvatarLayer) are set
  // assuming a caller with generous surrounding room, like /profile's own
  // padded editor frame — a tall headwear item calibrated to sit above the
  // head there can end up pushed outside a smaller, unpadded container
  // elsewhere (e.g. math-game.tsx's victory-screen RunnerAvatar). `crop`
  // (default true, matching every circular-badge caller — header nav icon,
  // tutor's student card, game-map/calendar companion badges, which
  // intentionally clip to their frame) hard-clips at this div's own edges;
  // pass false to let the full costume render even if it overflows this
  // box, instead of cutting it off mid-item.
  crop?: boolean;
}) {
  return (
    <div className={`relative h-full w-full ${crop ? "overflow-hidden" : ""} ${className}`}>
      {layers.map((layer, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={layer.itemId ?? `${layer.image}-${index}`}
          src={layer.image}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          style={{
            transform: `translate(${layer.offsetX}%, ${layer.offsetY}%) rotate(${layer.rotation}deg) scale(${layer.scale})`,
          }}
        />
      ))}
    </div>
  );
}
