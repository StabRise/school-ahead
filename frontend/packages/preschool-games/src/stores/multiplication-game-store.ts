import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_CHOICE_COUNT } from "../lib/multiplication-game";

// Client-side settings for the multiplication-table minigame — avatar
// running speed and hotbar size (see multiplication-game.tsx) — same shape
// as trains-game-store.ts's `speed`, persisted so a chosen setting survives
// closing the tab instead of resetting every session.

const DEFAULT_SPEED = 1;

interface MultiplicationGameState {
  speed: number;
  setSpeed: (speed: number) => void;
  // How many hotbar slots each question offers — see lib/multiplication-game.ts's
  // MIN_CHOICE_COUNT/MAX_CHOICE_COUNT for the allowed range.
  choiceCount: number;
  setChoiceCount: (choiceCount: number) => void;
}

export const useMultiplicationGameStore = create<MultiplicationGameState>()(
  persist(
    (set) => ({
      speed: DEFAULT_SPEED,
      setSpeed: (speed) => set({ speed }),
      choiceCount: DEFAULT_CHOICE_COUNT,
      setChoiceCount: (choiceCount) => set({ choiceCount }),
    }),
    { name: "multiplication-game-store" },
  ),
);
