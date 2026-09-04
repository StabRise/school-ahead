import { create } from "zustand";
import { persist } from "zustand/middleware";

// Client-side settings for the preschool "Cards" minigame (see
// components/preschool/cards-game.tsx, docs/preschool/games/reading/
// Cards.md). Persisted to localStorage so a chosen consonant/settings
// survive closing the tab instead of resetting to defaults every session —
// same pattern as stores/reading-game-store.ts.

// A consonant is just the name of its folder under public/static/syllables
// (see /api/cards-game-modes) — no fixed set, so this is a plain string
// rather than a literal union.
export type CardsGameConsonant = string;

const DEFAULT_CONSONANT: CardsGameConsonant = "м";

// "learning" is the flashcard grid (components/preschool/cards-game.tsx's
// CardsLevel, reusing BalloonLearningCards); "game" is the falling-cards
// knowledge check (CardsFallingGame) — same two-screen split, same store
// field name, as stores/balloon-pop-game-store.ts's BalloonScreenMode.
// Defaults to "learning" (unlike balloon-pop-game's "game" default) since
// that's the flashcard behavior this game already shipped with.
export type CardsScreenMode = "game" | "learning";
const DEFAULT_SCREEN_MODE: CardsScreenMode = "learning";

interface CardsGameState {
  consonant: CardsGameConsonant;
  setConsonant: (consonant: CardsGameConsonant) => void;
  showCaptions: boolean;
  setShowCaptions: (showCaptions: boolean) => void;
  // Silences the spoken-aloud syllable/word (TTS) — the success/completion
  // chimes still play, since they aren't tied to this setting.
  muted: boolean;
  setMuted: (muted: boolean) => void;
  screenMode: CardsScreenMode;
  setScreenMode: (screenMode: CardsScreenMode) => void;
}

export const useCardsGameStore = create<CardsGameState>()(
  persist(
    (set) => ({
      consonant: DEFAULT_CONSONANT,
      setConsonant: (consonant) => set({ consonant }),
      showCaptions: true,
      setShowCaptions: (showCaptions) => set({ showCaptions }),
      muted: false,
      setMuted: (muted) => set({ muted }),
      screenMode: DEFAULT_SCREEN_MODE,
      setScreenMode: (screenMode) => set({ screenMode }),
    }),
    { name: "cards-game-store" },
  ),
);
