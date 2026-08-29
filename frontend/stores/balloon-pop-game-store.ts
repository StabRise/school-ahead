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
  | "animalsEx"
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
    }),
    { name: "balloon-pop-game-store" },
  ),
);
