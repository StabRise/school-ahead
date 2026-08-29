import { create } from "zustand";
import { persist } from "zustand/middleware";

// Client-side settings for the preschool letter-train minigame (see
// components/preschool/trains-game.tsx). Persisted to localStorage so a
// chosen speed survives closing the tab instead of resetting every session.

const DEFAULT_SPEED = 1;

interface TrainsGameState {
  speed: number;
  setSpeed: (speed: number) => void;
}

export const useTrainsGameStore = create<TrainsGameState>()(
  persist(
    (set) => ({
      speed: DEFAULT_SPEED,
      setSpeed: (speed) => set({ speed }),
    }),
    { name: "trains-game-store" },
  ),
);
