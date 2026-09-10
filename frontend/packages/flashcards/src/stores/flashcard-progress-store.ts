import { create } from "zustand";
import { persist } from "zustand/middleware";

// A student's own "Знаю"/"Складно" mark on one card (docs/preschool/games/
// cards.md's Навчання mode) — persisted (localStorage) and keyed by
// group+set+card id so it survives reloads and carries over between
// sessions, unlike the old queue-based deck's session-only progress. Used
// both to badge the card in FlashcardLearnDeck and to drive the
// "review only difficult" / "skip known" filters in GameSettingsPanel.
export type FlashcardStatus = "known" | "difficult";

export function flashcardProgressKey(group: string, set: string, itemId: number): string {
  return `${group}::${set}::${itemId}`;
}

interface FlashcardProgressState {
  statusByCard: Record<string, FlashcardStatus>;
  // `status: null` clears the mark (back to unmarked) — the "Повторити"
  // button's effect.
  setCardStatus: (key: string, status: FlashcardStatus | null) => void;
}

export const useFlashcardProgressStore = create<FlashcardProgressState>()(
  persist(
    (set) => ({
      statusByCard: {},
      setCardStatus: (key, status) =>
        set((state) => {
          if (status === null) {
            if (!(key in state.statusByCard)) return state;
            const next = { ...state.statusByCard };
            delete next[key];
            return { statusByCard: next };
          }
          return { statusByCard: { ...state.statusByCard, [key]: status } };
        }),
    }),
    { name: "flashcard-progress-store" },
  ),
);
