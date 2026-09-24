import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SpeechLanguage } from "@school-ahead/api-client";

// Client-side settings for the "Слова" (Words) minigame (see
// words-game.tsx). Persisted to localStorage so the chosen language and
// letter survive closing the tab.
interface WordsGameState {
  // The cards' language (backend reading.Syllable.language) — picked
  // before the letter, since each language has its own letters.
  language: SpeechLanguage;
  setLanguage: (language: SpeechLanguage) => void;
  // A reading.Syllable first_letter; "" until the letter list loads and
  // self-heals it to the first one (see words-game.tsx).
  consonant: string;
  setConsonant: (consonant: string) => void;
  muted: boolean;
  setMuted: (muted: boolean) => void;
}

export const useWordsGameStore = create<WordsGameState>()(
  persist(
    (set) => ({
      language: "uk",
      setLanguage: (language) => set({ language }),
      consonant: "М",
      setConsonant: (consonant) => set({ consonant }),
      muted: false,
      setMuted: (muted) => set({ muted }),
    }),
    { name: "words-game-store" },
  ),
);
