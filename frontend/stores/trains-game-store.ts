import { create } from "zustand";
import { persist } from "zustand/middleware";

// Client-side settings for the preschool letter-train minigame (see
// components/preschool/trains-game.tsx). Persisted to localStorage so a
// chosen speed/zone survives closing the tab instead of resetting every
// session.

const DEFAULT_SPEED = 1;

// Which physical-keyboard letters the train hands out — see
// KEYBOARD_ZONES in trains-game.tsx. "all" is every letter in the current
// language, same as before this setting existed.
export type KeyboardZone = "left" | "center" | "right" | "all";
const DEFAULT_ZONE: KeyboardZone = "all";

interface TrainsGameState {
  speed: number;
  setSpeed: (speed: number) => void;
  zone: KeyboardZone;
  setZone: (zone: KeyboardZone) => void;
}

export const useTrainsGameStore = create<TrainsGameState>()(
  persist(
    (set) => ({
      speed: DEFAULT_SPEED,
      setSpeed: (speed) => set({ speed }),
      zone: DEFAULT_ZONE,
      setZone: (zone) => set({ zone }),
    }),
    { name: "trains-game-store" },
  ),
);
