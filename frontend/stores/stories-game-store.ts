import { create } from "zustand";
import { persist } from "zustand/middleware";

// Client-side settings for the preschool "Казки" minigame (see
// components/preschool/stories-game.tsx). Persisted to localStorage so
// muting survives closing the tab — same pattern as the other preschool
// game stores (e.g. stores/cards-game-store.ts), just without a
// consonant/level setting since a story, not a syllable set, is what's
// picked here (and that pick is one-tap-away on the picker screen, not
// worth persisting across sessions).

interface StoriesGameState {
  // Silences the spoken-aloud syllables/words/sentences (TTS) entirely.
  muted: boolean;
  setMuted: (muted: boolean) => void;
}

export const useStoriesGameStore = create<StoriesGameState>()(
  persist(
    (set) => ({
      muted: false,
      setMuted: (muted) => set({ muted }),
    }),
    { name: "stories-game-store" },
  ),
);
