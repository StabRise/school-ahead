import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SpeechLanguage } from "@school-ahead/api-client";

// Which language a student's конспект notes are assumed to be in, for the
// translate-on-select feature in the "Теорія" tab's split view
// (components/lesson-wizard/lesson-synopsis-split.tsx) — not tied to any
// one lesson (a student's notes are usually in the same language across
// lessons), so persisted to localStorage and shared across every lesson,
// same pattern as stores/flashcards-store.ts's ttsLanguage.
interface SynopsisLanguageState {
  synopsisLanguage: SpeechLanguage;
  setSynopsisLanguage: (language: SpeechLanguage) => void;
}

export const useSynopsisLanguageStore = create<SynopsisLanguageState>()(
  persist(
    (set) => ({
      synopsisLanguage: "pl",
      setSynopsisLanguage: (synopsisLanguage) => set({ synopsisLanguage }),
    }),
    { name: "synopsis-language-store" },
  ),
);
