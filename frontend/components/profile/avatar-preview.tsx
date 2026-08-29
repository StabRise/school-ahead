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
export function AvatarPreview() {
  const equippedAvatar = useAuthStore((state) => state.user?.equippedAvatar);
  const equippedClothing = useAuthStore((state) => state.user?.equippedClothing);
  const equippedHeadwear = useAuthStore((state) => state.user?.equippedHeadwear);
  const equippedAccessory = useAuthStore((state) => state.user?.equippedAccessory);

  const layers: Layer[] = [
    equippedAvatar?.image
      ? { image: equippedAvatar.image, scale: equippedAvatar.scale, offsetX: 0, offsetY: 0 }
      : null,
    equippedClothing?.image
      ? { image: equippedClothing.image, scale: equippedClothing.scale, offsetX: equippedClothing.offsetX, offsetY: equippedClothing.offsetY }
      : null,
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
