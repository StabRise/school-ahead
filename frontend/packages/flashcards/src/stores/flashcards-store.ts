import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_BACK_CONFIG,
  DEFAULT_FRONT_CONFIG,
  type CardFaceConfig,
  type CardFlipOrientation,
} from "../card-face-config";

export type FlashcardGameMode = "learn" | "quiz" | "list";

// A student's own study preferences for the "Cards" game (docs/preschool/
// games/cards.md) — none of this is tied to any one set, so it's persisted
// to localStorage and shared across every /games/cards/<group>/<set> the
// student opens, same as every other game's own <game>-game-store.ts.
interface FlashcardsState {
  mode: FlashcardGameMode;
  setMode: (mode: FlashcardGameMode) => void;
  frontConfig: CardFaceConfig;
  setFrontConfig: (config: CardFaceConfig) => void;
  backConfig: CardFaceConfig;
  setBackConfig: (config: CardFaceConfig) => void;
  // FlipCard's flip axis in "Навчання" — see CardFlipOrientation.
  flipOrientation: CardFlipOrientation;
  setFlipOrientation: (orientation: CardFlipOrientation) => void;
  // Whether a card's term is read aloud automatically in "Навчання" (see
  // lib/flashcard-speech.ts) — off by default so a game session doesn't
  // start speaking unexpectedly.
  soundEnabled: boolean;
  setSoundEnabled: (value: boolean) => void;
  // Collapsed state of the wide-screen-only topic sidebar (Навчання/Тест —
  // see FlashcardTopicSidebar) — open by default, same as every other
  // panel in this game.
  topicSidebarCollapsed: boolean;
  setTopicSidebarCollapsed: (value: boolean) => void;
}

export const useFlashcardsStore = create<FlashcardsState>()(
  persist(
    (set) => ({
      mode: "quiz",
      setMode: (mode) => set({ mode }),
      frontConfig: DEFAULT_FRONT_CONFIG,
      setFrontConfig: (frontConfig) => set({ frontConfig }),
      backConfig: DEFAULT_BACK_CONFIG,
      setBackConfig: (backConfig) => set({ backConfig }),
      flipOrientation: "vertical",
      setFlipOrientation: (flipOrientation) => set({ flipOrientation }),
      soundEnabled: false,
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      topicSidebarCollapsed: false,
      setTopicSidebarCollapsed: (topicSidebarCollapsed) => set({ topicSidebarCollapsed }),
    }),
    { name: "flashcards-store" },
  ),
);
