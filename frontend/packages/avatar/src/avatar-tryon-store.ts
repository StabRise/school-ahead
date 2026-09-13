import { create } from "zustand";
import type { EquippedAvatarItem } from "@school-ahead/api-client";

interface AvatarTryOnState {
  tryOnItem: EquippedAvatarItem | null;
  setTryOnItem: (item: EquippedAvatarItem | null) => void;
}

// Ephemeral, client-only "try it on" preview for a not-yet-purchased
// wardrobe item — see AvatarWardrobe's purchase flow, docs/core/avatar.md
// section 2.2. Separate from useAuthStore (the server-data mirror) since
// this never reflects a real equip: AvatarPreview layers it on top purely
// so the child can see the item before the purchase-confirm dialog closes,
// one way or the other.
export const useAvatarTryOnStore = create<AvatarTryOnState>((set) => ({
  tryOnItem: null,
  setTryOnItem: (item) => set({ tryOnItem: item }),
}));
