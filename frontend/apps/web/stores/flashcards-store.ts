import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_BACK_CONFIG,
  DEFAULT_FRONT_CONFIG,
  type CardFaceConfig,
} from "@/components/flashcards/card-face-config";

// What each side of a study flashcard shows (docs/preschool/games/cards.md,
// GameSettingsPanel) — a student's own study preference, not something
// tied to any one set, so it's persisted to localStorage and shared across
// every /games/cards/<group>/<set> the student opens, same as every other
// game's own <game>-game-store.ts.
interface FlashcardsState {
  frontConfig: CardFaceConfig;
  setFrontConfig: (config: CardFaceConfig) => void;
  backConfig: CardFaceConfig;
  setBackConfig: (config: CardFaceConfig) => void;
}

export const useFlashcardsStore = create<FlashcardsState>()(
  persist(
    (set) => ({
      frontConfig: DEFAULT_FRONT_CONFIG,
      setFrontConfig: (frontConfig) => set({ frontConfig }),
      backConfig: DEFAULT_BACK_CONFIG,
      setBackConfig: (backConfig) => set({ backConfig }),
    }),
    { name: "flashcards-store" },
  ),
);
