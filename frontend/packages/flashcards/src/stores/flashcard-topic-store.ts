import { create } from "zustand";
import { persist } from "zustand/middleware";

// The "Тема" filter (docs/preschool/games/cards.md) — unlike frontConfig/
// backConfig/mode in stores/flashcards-store.ts (a student's study
// preference shared across every set), which topic is selected is specific
// to one group+set: studying "math/7 klasa" narrowed to one topic
// shouldn't also narrow an unrelated "polski/..." set. Keyed the same way
// as stores/flashcard-progress-store.ts's statusByCard.
export function flashcardTopicKey(group: string, set: string): string {
  return `${group}::${set}`;
}

interface FlashcardTopicState {
  topicByCardSet: Record<string, string>;
  setTopic: (group: string, set: string, topic: string) => void;
}

export const useFlashcardTopicStore = create<FlashcardTopicState>()(
  persist(
    (set) => ({
      topicByCardSet: {},
      setTopic: (group, cardSet, topic) =>
        set((state) => ({
          topicByCardSet: { ...state.topicByCardSet, [flashcardTopicKey(group, cardSet)]: topic },
        })),
    }),
    { name: "flashcard-topic-store" },
  ),
);
