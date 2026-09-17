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

// `fallback` is the group's own title.json-declared default (see
// FlashcardLanguage in lib/flashcard-types.ts) when the group set one —
// only used until the student picks a language of their own for this
// group+set, at which point the persisted choice always wins.
export function getFlashcardLanguage(
  languageByCardSet: Record<string, SpeechLanguage>,
  group: string,
  set: string,
  fallback: SpeechLanguage = DEFAULT_LANGUAGE,
): SpeechLanguage {
  return languageByCardSet[flashcardLanguageKey(group, set)] ?? fallback;
}
