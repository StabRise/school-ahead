import { create } from "zustand";

// Client-only ephemeral state — never a cache for server data and never
// holds tokens. Hydrated from the Orval-generated GET /api/auth/me hook.
// See docs/architecture/06-frontend-architecture.md.

export type InterfaceMode = "default" | "preschool";

// The chosen companion character (Raccoon, ...) — see docs/core/avatar.md.
// Distinct from `avatarUrl` below, which is the Google-account profile
// picture. `items` is its wardrobe catalog (see EquippedAvatarItem).
export interface EquippedAvatar {
  id: number;
  key: string;
  name: string;
  image: string | null;
  // Size multiplier set from the tutor avatar editor — see AvatarPreview.
  scale: number;
  items: EquippedAvatarItem[];
}

// A wardrobe piece (clothing/headwear/accessory) — either catalog entry (on
// EquippedAvatar.items) or the one currently equipped in a slot — see
// docs/core/avatar.md section 2.2.
export interface EquippedAvatarItem {
  id: number;
  slot: "clothing" | "headwear" | "accessory";
  key: string;
  name: string;
  image: string | null;
  // Fine-tuning set from the tutor avatar editor — see AvatarPreview.
  // offsetX/offsetY are percentages of the avatar canvas.
  scale: number;
  offsetX: number;
  offsetY: number;
  // Stacking order among simultaneously-equipped clothing items (lower draws
  // first/closer to skin) — meaningless for headwear/accessory, which equip
  // one at a time. See docs/core/avatar.md.
  layerOrder: number;
  // Diamond shop — see docs/core/avatar.md section 2.2. price=0 is free.
  // isUnlocked reflects the current student (always true for price=0);
  // equipping requires it, and the wardrobe offers a purchase flow when
  // it's false.
  price: number;
  isUnlocked: boolean;
}

export interface AuthUser {
  id: number;
  email: string;
  role: "student" | "tutor" | "parent" | "admin";
  name: string;
  locale: string;
  avatarUrl: string;
  // Only meaningful for role="student" — see docs/interfaces/preschool.md.
  interfaceMode: InterfaceMode | null;
  // Only meaningful for role="student", and only once one is chosen — see
  // docs/core/avatar.md.
  equippedAvatar: EquippedAvatar | null;
  // Only meaningful for role="student", and only once picked — see
  // docs/core/avatar.md section 2.2. Clothing is a list (several pieces worn
  // together, e.g. a t-shirt + pants + jacket), pre-sorted by layerOrder.
  equippedClothingItems: EquippedAvatarItem[];
  equippedHeadwear: EquippedAvatarItem | null;
  equippedAccessory: EquippedAvatarItem | null;
  // Only meaningful for role="student" — see docs/core/progress.md section 2.
  diamondBalance: number | null;
}

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clear: () => set({ user: null }),
}));
