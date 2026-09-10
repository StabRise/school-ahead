"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BarChart3 } from "lucide-react";
import { useFlashcardQuizResultsStore } from "./stores/flashcard-quiz-results-store";

const DATE_FORMAT = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// Past "Тест" attempts for this exact set (docs/preschool/games/cards.md) —
// every completed round is recorded client-side (see
// useFlashcardQuizResultsStore, FlashcardGamePage's onComplete wiring) so a
// student can see their own progress over time. Same
// button-toggles-a-panel-that-closes-on-outside-click pattern as
// GameSettingsPanel.
export function QuizResultsPanel({ group, set }: { group: string; set: string }) {
  const t = useTranslations("FlashcardsGame");
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const attempts = useFlashcardQuizResultsStore((s) => s.attempts).filter(
    (attempt) => attempt.group === group && attempt.set === set,
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t("resultsButton")}
        title={t("resultsButton")}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <BarChart3 className="size-4" />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full z-10 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("resultsTitle")}
          </p>

          {attempts.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("resultsEmpty")}</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {attempts.map((attempt, index) => {
                const percent = Math.round((attempt.score / attempt.total) * 100);
                return (
                  <li
                    key={`${attempt.completedAt}:${index}`}
                    className="flex flex-col gap-0.5 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500 dark:text-slate-400">
                        {DATE_FORMAT.format(new Date(attempt.completedAt))}
                      </span>
                      <span className="font-medium text-slate-800 dark:text-slate-100">
                        {attempt.score}/{attempt.total} · {percent}%
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {attempt.topic === "all" ? t("allTopicsOption") : attempt.topic}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
