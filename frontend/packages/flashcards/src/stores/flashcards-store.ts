import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SpeechLanguage } from "@school-ahead/api-client";
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
  // Which Piper voice speaks the term — independent of the app's own UI
  // locale (currently uk-only), since a card set's term can be in any of
  // these languages.
  ttsLanguage: SpeechLanguage;
  setTtsLanguage: (language: SpeechLanguage) => void;
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
      ttsLanguage: "en",
      setTtsLanguage: (ttsLanguage) => set({ ttsLanguage }),
    }),
    { name: "flashcards-store" },
  ),
);
