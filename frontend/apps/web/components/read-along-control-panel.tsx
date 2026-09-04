"use client";

import { useTranslations } from "next-intl";
import { FastForward, FolderPlus, Play, Rewind, SkipBack, Square } from "lucide-react";
import type { SpeechLanguage } from "@school-ahead/api-client";

export const LANGUAGE_OPTIONS: { value: SpeechLanguage; labelKey: string }[] = [
  { value: "pl", labelKey: "languagePolish" },
  { value: "en", labelKey: "languageEnglish" },
  { value: "uk", labelKey: "languageUkrainian" },
];

// Bottom fixed playback bar for a loaded ReadAlongPlayer: restart, previous/
// next paragraph, a single play/stop toggle, and a language switcher —
// shared by components/read-along-page.tsx and the lesson wizard's
// "Матеріали" tab. `onAddToLesson`, when given, adds one more icon button
// ("Додати в урок") at the start of the bar — omitted entirely wherever the
// content is already inside a lesson (nothing to add it *to*).
export function ReadAlongControlPanel({
  speakingIndex,
  currentParagraphIndex,
  paragraphCount,
  language,
  onFromStart,
  onPrevious,
  onPlayPause,
  onNext,
  onLanguageChange,
  onAddToLesson,
}: {
  speakingIndex: number | null;
  currentParagraphIndex: number;
  paragraphCount: number;
  language: SpeechLanguage;
  onFromStart: () => void;
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onLanguageChange: (language: SpeechLanguage) => void;
  onAddToLesson?: () => void;
}) {
  const t = useTranslations("ReadAlong");

  return (
    <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2.5 text-white shadow-xl sm:gap-4 sm:px-5 sm:py-3">
        {onAddToLesson && (
          <button
            type="button"
            aria-label={t("addToLessonButton")}
            onClick={onAddToLesson}
            className="rounded-full p-2 hover:bg-white/10"
          >
            <FolderPlus className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          aria-label={t("fromStartButton")}
          onClick={onFromStart}
          className="rounded-full p-2 hover:bg-white/10"
        >
          <SkipBack className="h-5 w-5" fill="currentColor" />
        </button>
        <button
          type="button"
          aria-label={t("previousParagraphButton")}
          onClick={onPrevious}
          disabled={currentParagraphIndex === 0}
          className="rounded-full p-2 hover:bg-white/10 disabled:opacity-40"
        >
          <Rewind className="h-5 w-5" fill="currentColor" />
        </button>
        <button
          type="button"
          aria-label={speakingIndex !== null ? t("stopButton") : t("playButton")}
          onClick={onPlayPause}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-900 hover:bg-gray-100"
        >
          {speakingIndex !== null ? (
            <Square className="h-5 w-5" fill="currentColor" />
          ) : (
            <Play className="h-5 w-5 translate-x-0.5" fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          aria-label={t("nextParagraphButton")}
          onClick={onNext}
          disabled={currentParagraphIndex >= paragraphCount - 1}
          className="rounded-full p-2 hover:bg-white/10 disabled:opacity-40"
        >
          <FastForward className="h-5 w-5" fill="currentColor" />
        </button>
        <select
          aria-label={t("languageLabel")}
          value={language}
          onChange={(e) => onLanguageChange(e.target.value as SpeechLanguage)}
          className="rounded-full border border-white/20 bg-white/10 px-2 py-1.5 text-xs font-medium text-white outline-none"
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="text-gray-900">
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
