import { create } from "zustand";

// Client-only ephemeral state — never a cache for server data and never
// holds tokens. Hydrated from the Orval-generated GET /api/auth/me hook.
// See docs/architecture/06-frontend-architecture.md.

export type InterfaceMode = "default" | "simple" | "preschool";

// How much text the read-along "Перекласти" feature translates per
// selection, and whether that translation runs automatically — see
// components/profile/translation-settings.tsx and
// components/read-along-content.tsx.
export type TranslationScope = "off" | "word" | "sentence";

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
  // A student's own move/rotate override of this item's position, set by
  // dragging/rotating it directly on their own avatar preview — see
  // components/profile/avatar-preview.tsx. offsetX/offsetY above already
  // reflect the override when one exists; rotation (degrees, clockwise) has
  // no tutor-set counterpart, so it's 0 unless this student moved it.
  // Private to this student — see EquippedItemPlacement on the backend.
  rotation: number;
  // Stacking order among simultaneously-equipped items in the same slot
  // (lower draws first/closer to the body). See docs/core/avatar.md.
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
  // Only meaningful for role="student" — see components/profile/translation-settings.tsx.
  translationScope: TranslationScope | null;
  translateOnSelect: boolean | null;
  // Only meaningful for role="student", and only once one is chosen — see
  // docs/core/avatar.md.
  equippedAvatar: EquippedAvatar | null;
  // Only meaningful for role="student", and only once picked — see
  // docs/core/avatar.md section 2.2. Each slot is a list (several pieces
  // worn together, e.g. a t-shirt + pants + jacket, or two stacked hats),
  // pre-sorted by layerOrder.
  equippedClothingItems: EquippedAvatarItem[];
  equippedHeadwearItems: EquippedAvatarItem[];
  equippedAccessoryItems: EquippedAvatarItem[];
  // Only meaningful for role="student" — see docs/core/progress.md section 2.
  diamondBalance: number | null;
}

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  // Optimistic local bump for a reward whose response doesn't echo the
  // full user (e.g. StudentLessonOut.diamonds_awarded from submit-quiz/
  // confirm-understanding) — a no-op if there's no user or diamondBalance
  // isn't tracked (non-student roles). Callers should still invalidate
  // GET /auth/me so this can't drift from the server's true balance.
  addDiamonds: (amount: number) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  addDiamonds: (amount) =>
    set((state) =>
      state.user && state.user.diamondBalance !== null
        ? { user: { ...state.user, diamondBalance: state.user.diamondBalance + amount } }
        : {},
    ),
  clear: () => set({ user: null }),
}));
