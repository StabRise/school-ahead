"use client";

import { useAuthStore, type EquippedAvatarItem } from "@/stores/auth-store";

interface Layer {
  image: string;
  scale: number;
  offsetX: number;
  offsetY: number;
}

function itemsToLayers(items: EquippedAvatarItem[] | undefined): Layer[] {
  return (items ?? [])
    .filter((item) => item.image)
    .map((item) => ({ image: item.image as string, scale: item.scale, offsetX: item.offsetX, offsetY: item.offsetY }));
}

// Composites the equipped SVG layers (body -> clothing -> headwear ->
// accessory) into one live preview — see docs/core/avatar.md section 2:
// every Avatar/AvatarItem is drawn in the same canvas coordinate system, so
// stacking plain absolutely-positioned <img>s reproduces the layering
// without any per-item offset math, beyond each layer's own scale/offset
// (tuned from the tutor avatar editor — see components/tutor/avatar-editor).
// Every slot can hold several pieces worn together (a t-shirt + pants +
// jacket, two stacked hats, ...); the store already has each slot's items
// pre-sorted by layerOrder — see accounts.api._user_out on the backend.
export function AvatarPreview() {
  const equippedAvatar = useAuthStore((state) => state.user?.equippedAvatar);
  const equippedClothingItems = useAuthStore((state) => state.user?.equippedClothingItems);
  const equippedHeadwearItems = useAuthStore((state) => state.user?.equippedHeadwearItems);
  const equippedAccessoryItems = useAuthStore((state) => state.user?.equippedAccessoryItems);

  const layers: Layer[] = [
    ...(equippedAvatar?.image
      ? [{ image: equippedAvatar.image, scale: equippedAvatar.scale, offsetX: 0, offsetY: 0 }]
      : []),
    ...itemsToLayers(equippedClothingItems),
    ...itemsToLayers(equippedHeadwearItems),
    ...itemsToLayers(equippedAccessoryItems),
  ];

  return (
    <div className="relative aspect-square w-100 shrink-0 overflow-hidden rounded-xl bg-gray-100">
      {layers.map((layer) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={layer.image}
          src={layer.image}
          alt=""
          className="absolute inset-0 h-full w-full"
          style={{ transform: `translate(${layer.offsetX}%, ${layer.offsetY}%) scale(${layer.scale})` }}
        />
      ))}
    </div>
  );
}
