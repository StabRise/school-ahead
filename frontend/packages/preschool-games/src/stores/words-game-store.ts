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
  // Which parts of a card are on screen — each can be hidden (e.g. hide
  // the picture so the child can't guess the word from it).
  show: WordsGameShow;
  setShow: (part: keyof WordsGameShow, visible: boolean) => void;
}

export interface WordsGameShow {
  syllable: boolean;
  icon: boolean;
  word: boolean;
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
      show: { syllable: true, icon: true, word: true },
      setShow: (part, visible) => set((state) => ({ show: { ...state.show, [part]: visible } })),
    }),
    { name: "words-game-store" },
  ),
);
