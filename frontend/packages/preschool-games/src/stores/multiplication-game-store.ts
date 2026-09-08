import { create } from "zustand";
import { persist } from "zustand/middleware";

// Client-side setting for the multiplication-table minigame's avatar
// running speed (see multiplication-game.tsx) — same shape as
// trains-game-store.ts's `speed`, persisted so a chosen pace survives
// closing the tab instead of resetting every session.

const DEFAULT_SPEED = 1;

interface MultiplicationGameState {
  speed: number;
  setSpeed: (speed: number) => void;
}

export const useMultiplicationGameStore = create<MultiplicationGameState>()(
  persist(
    (set) => ({
      speed: DEFAULT_SPEED,
      setSpeed: (speed) => set({ speed }),
    }),
    { name: "multiplication-game-store" },
  ),
);
