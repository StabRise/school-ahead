import { create } from "zustand";

// Client-only ephemeral state — never a cache for server data and never
// holds tokens. Hydrated from the Orval-generated GET /api/auth/me hook.
// See docs/architecture/06-frontend-architecture.md.

export type InterfaceMode = "default" | "preschool";

// The chosen companion character (Raccoon, Fox, ...) — see
// docs/core/avatar.md. Distinct from `avatarUrl` below, which is the
// Google-account profile picture.
export interface EquippedAvatar {
  id: number;
  key: string;
  name: string;
  image: string | null;
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
