import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SpeechLanguage } from "@/lib/piper-tts";

// Client-side settings for the preschool balloon-pop minigame (see
// components/preschool/balloon-pop-game.tsx). Persisted to localStorage so
// a chosen mode/language/sizing/mute survives closing the tab instead of
// resetting to defaults every session.

export type BalloonMode =
  | "numbers10"
  | "numbers20"
  | "numbers100"
  | "colors"
  | "letters"
  | "greetings"
  | "animals"
  | "schoolSupplies"
  | "schoolSuppliesEx"
  | "family"
  | "bodyParts"
  | "fruits";

const DEFAULT_MODE: BalloonMode = "numbers10";
const DEFAULT_LANGUAGE: SpeechLanguage = "en";
const DEFAULT_SIZE = 112;
const DEFAULT_SPEED = 1;
const DEFAULT_COUNT = 9;

// For modes with a picture pool (animals/schoolSuppliesEx/family/
// bodyParts/fruits, see PICTURE_POOL_BY_MODE in balloon-pop-game.tsx) —
// how many random items from that mode's pool the "game" (balloons) and
// "learning" (flashcards) screens both draw from, chosen once per
// (mode, cardCount) so switching between the two never reshuffles it.
export type BalloonScreenMode = "game" | "learning";
const DEFAULT_SCREEN_MODE: BalloonScreenMode = "game";
const DEFAULT_CARD_COUNT = 6;

interface BalloonPopGameState {
  mode: BalloonMode;
  setMode: (mode: BalloonMode) => void;
  language: SpeechLanguage;
  setLanguage: (language: SpeechLanguage) => void;
  size: number;
  setSize: (size: number) => void;
  speed: number;
  setSpeed: (speed: number) => void;
  maxOnScreen: number;
  setMaxOnScreen: (maxOnScreen: number) => void;
  // Silences the spoken-aloud balloon text (TTS) — the procedural pop sound
  // still plays, since it isn't tied to the language setting.
  muted: boolean;
  setMuted: (muted: boolean) => void;
  screenMode: BalloonScreenMode;
  setScreenMode: (screenMode: BalloonScreenMode) => void;
  cardCount: number;
  setCardCount: (cardCount: number) => void;
}

export const useBalloonPopGameStore = create<BalloonPopGameState>()(
  persist(
    (set) => ({
      mode: DEFAULT_MODE,
      setMode: (mode) => set({ mode }),
      language: DEFAULT_LANGUAGE,
      setLanguage: (language) => set({ language }),
      size: DEFAULT_SIZE,
      setSize: (size) => set({ size }),
      speed: DEFAULT_SPEED,
      setSpeed: (speed) => set({ speed }),
      maxOnScreen: DEFAULT_COUNT,
      setMaxOnScreen: (maxOnScreen) => set({ maxOnScreen }),
      muted: false,
      setMuted: (muted) => set({ muted }),
      screenMode: DEFAULT_SCREEN_MODE,
      setScreenMode: (screenMode) => set({ screenMode }),
      cardCount: DEFAULT_CARD_COUNT,
      setCardCount: (cardCount) => set({ cardCount }),
    }),
    { name: "balloon-pop-game-store" },
  ),
);
