import { create } from "zustand";

// Client-only ephemeral state — never a cache for server data and never
// holds tokens. Hydrated from the Orval-generated GET /api/auth/me hook.
// See docs/architecture/06-frontend-architecture.md.

export interface AuthUser {
  id: number;
  email: string;
  role: "student" | "tutor" | "parent" | "admin";
  name: string;
  locale: string;
  avatarUrl: string;
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
