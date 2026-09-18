"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PRESCHOOL_LESSONS_FILTERS, type PreschoolLessonsFilter } from "@/lib/preschool-lessons-filter";
import { usePreschoolLessonsFilterStore } from "@/stores/preschool-lessons-filter-store";

const FILTER_EMOJI: Record<PreschoolLessonsFilter, string> = {
  available: "🎯",
  all: "📚",
  favorites: "❤️",
};

// The gear in the preschool subject page's top-right corner, styled and
// behaving like the ⚙️ every minigame has (e.g. math-game.tsx): a small round
// white button that toggles a floating panel, closed by a tap anywhere
// outside it. The panel picks which lessons the page lists — see
// lib/preschool-lessons-filter.ts. `onChange` lets the page reset anything
// tied to the previous list (its "load more as you scroll" window).
export function PreschoolLessonsFilterButton({ onChange }: { onChange: () => void }) {
  const t = useTranslations("PreschoolSubjectDetail");
  const filter = usePreschoolLessonsFilterStore((state) => state.filter);
  const setFilter = usePreschoolLessonsFilterStore((state) => state.setFilter);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const choose = (next: PreschoolLessonsFilter) => {
    setFilter(next);
    onChange();
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={t("settingsButton")}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        ⚙️
      </button>

      {open && (
        <div
          ref={panelRef}
          role="group"
          aria-label={t("filterTitle")}
          className="absolute right-0 top-full z-30 mt-2 flex w-64 flex-col gap-2 rounded-2xl bg-white p-3 text-sm shadow-lg ring-2 ring-gray-200"
        >
          <span className="px-1 font-medium text-gray-700">{t("filterTitle")}</span>
          {PRESCHOOL_LESSONS_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => choose(option)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left font-bold transition ${
                filter === option
                  ? "bg-emerald-400 text-white ring-2 ring-emerald-500"
                  : "bg-gray-100 text-gray-800 hover:bg-gray-200"
              }`}
            >
              <span className="text-2xl" aria-hidden="true">
                {FILTER_EMOJI[option]}
              </span>
              {t(`filter.${option}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
