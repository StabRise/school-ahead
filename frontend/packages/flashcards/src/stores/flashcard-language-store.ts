import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SpeechLanguage } from "@school-ahead/api-client";

// Which Piper voice reads a card's term aloud (docs/preschool/games/
// cards.md) — unlike frontConfig/backConfig/mode in stores/flashcards-
// store.ts (a student's study preference shared across every set), the
// term's language is specific to one group+set: "math/7 klasa" is read in
// Polish, "hisp/start" in Spanish, and picking one for one set shouldn't
// change the language of an unrelated set. Keyed the same way as
// stores/flashcard-topic-store.ts's topicByCardSet.
export function flashcardLanguageKey(group: string, set: string): string {
  return `${group}::${set}`;
}

const DEFAULT_LANGUAGE: SpeechLanguage = "en";

interface FlashcardLanguageState {
  languageByCardSet: Record<string, SpeechLanguage>;
  setLanguage: (group: string, set: string, language: SpeechLanguage) => void;
}

export const useFlashcardLanguageStore = create<FlashcardLanguageState>()(
  persist(
    (set) => ({
      languageByCardSet: {},
      setLanguage: (group, cardSet, language) =>
        set((state) => ({
          languageByCardSet: { ...state.languageByCardSet, [flashcardLanguageKey(group, cardSet)]: language },
        })),
    }),
    { name: "flashcard-language-store" },
  ),
);

export function getFlashcardLanguage(
  languageByCardSet: Record<string, SpeechLanguage>,
  group: string,
  set: string,
): SpeechLanguage {
  return languageByCardSet[flashcardLanguageKey(group, set)] ?? DEFAULT_LANGUAGE;
}
