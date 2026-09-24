import { create } from "zustand";
import { persist } from "zustand/middleware";

// Client-side settings for the "Казки" (Stories) minigame's picker (see
// stories-game.tsx's StoryPicker). Persisted to localStorage so the chosen
// language filter survives opening a story and coming back, or a reload.
interface StoriesGameState {
  // A backend QuizLanguage code, or "all" for every story.
  languageFilter: string;
  setLanguageFilter: (languageFilter: string) => void;
}

export const useStoriesGameStore = create<StoriesGameState>()(
  persist(
    (set) => ({
      languageFilter: "all",
      setLanguageFilter: (languageFilter) => set({ languageFilter }),
    }),
    { name: "stories-game-store" },
  ),
);
