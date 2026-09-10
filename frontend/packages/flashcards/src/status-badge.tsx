"use client";

import { Check, Flag } from "lucide-react";
import type { FlashcardStatus } from "./stores/flashcard-progress-store";

// The «Знаю»/«Складно» mark (docs/preschool/games/cards.md) — shared by
// FlipCard (Навчання) and FlashcardQuiz's question/option cards (Тест), so
// a card's status reads the same everywhere it can appear. Renders nothing
// for an unmarked card. Caller positions it (e.g. `absolute right-2 top-2`)
// via `className`.
export function StatusBadge({ status, className = "" }: { status?: FlashcardStatus; className?: string }) {
  if (!status) return null;
  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center rounded-full text-white shadow ${
        status === "known" ? "bg-emerald-600" : "bg-amber-600"
      } ${className}`}
    >
      {status === "known" ? <Check className="size-4" /> : <Flag className="size-4" />}
    </span>
  );
}
