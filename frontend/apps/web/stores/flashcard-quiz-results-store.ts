import { create } from "zustand";
import { persist } from "zustand/middleware";

// One completed "Тест" round (docs/preschool/games/cards.md) — see
// QuizResultsPanel, shown per set (filtered by group+set) as a small
// history table. Client-only (localStorage), never sent anywhere — this is
// a student's own scratch history of their attempts, not a graded record.
export interface QuizAttempt {
  group: string;
  set: string;
  topic: string; // "all" or the category title the round was scoped to
  score: number;
  total: number;
  completedAt: string; // ISO timestamp
}

// Keeps localStorage from growing without bound across every set a student
// ever plays — oldest attempts drop off first.
const MAX_ATTEMPTS = 200;

interface FlashcardQuizResultsState {
  attempts: QuizAttempt[];
  addAttempt: (attempt: Omit<QuizAttempt, "completedAt">) => void;
}

export const useFlashcardQuizResultsStore = create<FlashcardQuizResultsState>()(
  persist(
    (set) => ({
      attempts: [],
      addAttempt: (attempt) =>
        set((state) => ({
          attempts: [{ ...attempt, completedAt: new Date().toISOString() }, ...state.attempts].slice(
            0,
            MAX_ATTEMPTS,
          ),
        })),
    }),
    { name: "flashcard-quiz-results-store" },
  ),
);
