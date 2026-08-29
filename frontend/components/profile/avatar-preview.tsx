"use client";

import { useAuthStore } from "@/stores/auth-store";

interface Layer {
  image: string;
  scale: number;
  offsetX: number;
  offsetY: number;
}

// Composites the equipped SVG layers (body -> clothing -> headwear ->
// accessory) into one live preview — see docs/core/avatar.md section 2:
// every Avatar/AvatarItem is drawn in the same canvas coordinate system, so
// stacking plain absolutely-positioned <img>s reproduces the layering
// without any per-item offset math, beyond each layer's own scale/offset
// (tuned from the tutor avatar editor — see components/tutor/avatar-editor).
// Clothing can be several pieces worn together (t-shirt + pants + jacket,
// ...); the store already has them pre-sorted by layerOrder (underwear/socks
// first, backpack/bag last) — see accounts.api._user_out on the backend.
export function AvatarPreview() {
  const equippedAvatar = useAuthStore((state) => state.user?.equippedAvatar);
  const equippedClothingItems = useAuthStore((state) => state.user?.equippedClothingItems);
  const equippedHeadwear = useAuthStore((state) => state.user?.equippedHeadwear);
  const equippedAccessory = useAuthStore((state) => state.user?.equippedAccessory);

  const layers: Layer[] = [
    equippedAvatar?.image
      ? { image: equippedAvatar.image, scale: equippedAvatar.scale, offsetX: 0, offsetY: 0 }
      : null,
    ...(equippedClothingItems ?? [])
      .filter((item) => item.image)
      .map((item) => ({ image: item.image as string, scale: item.scale, offsetX: item.offsetX, offsetY: item.offsetY })),
    equippedHeadwear?.image
      ? { image: equippedHeadwear.image, scale: equippedHeadwear.scale, offsetX: equippedHeadwear.offsetX, offsetY: equippedHeadwear.offsetY }
      : null,
    equippedAccessory?.image
      ? { image: equippedAccessory.image, scale: equippedAccessory.scale, offsetX: equippedAccessory.offsetX, offsetY: equippedAccessory.offsetY }
      : null,
  ].filter((layer): layer is Layer => layer !== null);

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
