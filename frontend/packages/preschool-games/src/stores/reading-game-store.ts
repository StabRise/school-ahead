import { create } from "zustand";
import { persist } from "zustand/middleware";

// Client-side settings for the preschool reading (syllable drag-and-drop)
// minigame (see components/preschool/reading-game.tsx). Persisted to
// localStorage so a chosen consonant/settings survive closing the tab
// instead of resetting to defaults every session.

// A consonant is just the name of its folder under
// public/static/letters (see /api/reading-game-modes) — no fixed set,
// so this is a plain string rather than a literal union.
export type ReadingGameConsonant = string;

const DEFAULT_CONSONANT: ReadingGameConsonant = "М";
const DEFAULT_SYLLABLE_COUNT = 4;
const MIN_SYLLABLE_COUNT = 3;
const MAX_SYLLABLE_COUNT = 9;

interface ReadingGameState {
  consonant: ReadingGameConsonant;
  setConsonant: (consonant: ReadingGameConsonant) => void;
  syllableCount: number;
  setSyllableCount: (syllableCount: number) => void;
  showCaptions: boolean;
  setShowCaptions: (showCaptions: boolean) => void;
  uppercase: boolean;
  setUppercase: (uppercase: boolean) => void;
  // Silences the spoken-aloud syllable/word (TTS) — the success/error chimes
  // still play, since they aren't tied to this setting.
  muted: boolean;
  setMuted: (muted: boolean) => void;
}

export { MIN_SYLLABLE_COUNT, MAX_SYLLABLE_COUNT };

export const useReadingGameStore = create<ReadingGameState>()(
  persist(
    (set) => ({
      consonant: DEFAULT_CONSONANT,
      setConsonant: (consonant) => set({ consonant }),
      syllableCount: DEFAULT_SYLLABLE_COUNT,
      setSyllableCount: (syllableCount) =>
        set({ syllableCount: Math.min(MAX_SYLLABLE_COUNT, Math.max(MIN_SYLLABLE_COUNT, syllableCount)) }),
      showCaptions: true,
      setShowCaptions: (showCaptions) => set({ showCaptions }),
      uppercase: true,
      setUppercase: (uppercase) => set({ uppercase }),
      muted: false,
      setMuted: (muted) => set({ muted }),
    }),
    { name: "reading-game-store" },
  ),
);
