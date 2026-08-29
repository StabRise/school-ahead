"use client";

import { useAuthStore } from "@/stores/auth-store";

// Composites the equipped SVG layers (body -> clothing -> headwear ->
// accessory) into one live preview — see docs/core/avatar.md section 2:
// every Avatar/AvatarItem is drawn in the same canvas coordinate system, so
// stacking plain absolutely-positioned <img>s reproduces the layering
// without any per-item offset math.
export function AvatarPreview() {
  const equippedAvatar = useAuthStore((state) => state.user?.equippedAvatar);
  const equippedClothing = useAuthStore((state) => state.user?.equippedClothing);
  const equippedHeadwear = useAuthStore((state) => state.user?.equippedHeadwear);
  const equippedAccessory = useAuthStore((state) => state.user?.equippedAccessory);

  const layers = [
    equippedAvatar?.image,
    equippedClothing?.image,
    equippedHeadwear?.image,
    equippedAccessory?.image,
  ].filter((image): image is string => Boolean(image));

  return (
    <div className="relative aspect-square w-100 shrink-0 overflow-hidden rounded-xl bg-gray-100">
      {layers.map((image) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={image} src={image} alt="" className="absolute inset-0 h-full w-full" />
      ))}
    </div>
  );
}
