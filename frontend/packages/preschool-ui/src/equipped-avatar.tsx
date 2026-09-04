"use client";

import { useAuthStore, type EquippedAvatarItem } from "@school-ahead/api-client";

export interface AvatarLayer {
  image: string;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function itemsToLayers(items: EquippedAvatarItem[] | undefined): AvatarLayer[] {
  return (items ?? [])
    .filter((item) => item.image)
    .map((item) => ({ image: item.image as string, scale: item.scale, offsetX: item.offsetX, offsetY: item.offsetY }));
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

  return [
    ...(equippedAvatar?.image
      ? [{ image: equippedAvatar.image, scale: equippedAvatar.scale, offsetX: 0, offsetY: 0 }]
      : []),
    ...itemsToLayers(equippedClothingItems),
    ...itemsToLayers(equippedHeadwearItems),
    ...itemsToLayers(equippedAccessoryItems),
  ];
}

// Composites `layers` into one absolutely-stacked image pile filling its
// container — the canvas part of what used to be only
// components/profile/avatar-preview.tsx, factored out so the header and
// every preschool companion frame can drop the same clothed avatar into
// their own differently-sized circular frames instead of each duplicating
// (or, previously, skipping) this layering.
export function EquippedAvatarLayers({ layers, className = "" }: { layers: AvatarLayer[]; className?: string }) {
  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      {layers.map((layer) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={layer.image}
          src={layer.image}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          style={{ transform: `translate(${layer.offsetX}%, ${layer.offsetY}%) scale(${layer.scale})` }}
        />
      ))}
    </div>
  );
}
