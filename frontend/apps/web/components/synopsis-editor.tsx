"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, Pencil } from "lucide-react";
import type { SpeechLanguage } from "@school-ahead/api-client";
import { Markdown } from "@/components/markdown";
import { TranslatableContent } from "@/components/translatable-content";
import { LANGUAGE_OPTIONS } from "@/components/read-along-control-panel";
import { useSynopsisLanguageStore } from "@/stores/synopsis-language-store";

// Shared "view/edit a конспект" widget — a Markdown preview (with
// translate-on-select, see TranslatableContent) that's the default view,
// plus a raw-markdown textarea toggled via a small icon button (Перегляд
// ⇄ Редагувати), and a source-language picker for the preview's translate
// feature. Used both by the student wizard's split view
// (lesson-wizard/lesson-synopsis-split.tsx, editing their own copy of a
// lesson's конспект) and the tutor's Lesson detail page
// (tutor/lesson-synopsis-panel.tsx, editing the lesson's original) —
// `onChange` fires on every keystroke; each caller owns its own
// debounced-autosave mutation, since the two save to different places.
export function SynopsisEditor({
  value,
  onChange,
  isSaving,
  enableDictionary = true,
  studentLessonId,
}: {
  value: string;
  onChange: (value: string) => void;
  isSaving?: boolean;
  enableDictionary?: boolean;
  // Enables the sibling "add to cards" button — omitted by the tutor's own
  // panel (tutor/lesson-synopsis-panel.tsx), which has no StudentProfile.
  studentLessonId?: number;
}) {
  const t = useTranslations("LessonWizard");
  // LANGUAGE_OPTIONS' labelKeys are ReadAlong namespace keys (see
  // read-along-control-panel.tsx) — reused as-is rather than duplicated.
  const tReadAlong = useTranslations("ReadAlong");
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  // Persisted across reloads/lessons/contexts (stores/synopsis-language-store.ts)
  // — a shared "what language is this конспект probably in" preference,
  // not worth re-picking on every visit.
  const sourceLanguage = useSynopsisLanguageStore((state) => state.synopsisLanguage);
  const setSourceLanguage = useSynopsisLanguageStore((state) => state.setSynopsisLanguage);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-gray-700">{t("synopsisPanelLabel")}</label>
        <div className="flex items-center gap-2">
          {isSaving && <span className="text-xs text-gray-400">{t("synopsisSaving")}</span>}
          {mode === "preview" && (
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value as SpeechLanguage)}
              aria-label={t("synopsisLanguageLabel")}
              title={t("synopsisLanguageLabel")}
              className="rounded-md border border-gray-300 px-1.5 py-1 text-xs text-gray-700"
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {tReadAlong(option.labelKey)}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setMode((prev) => (prev === "preview" ? "edit" : "preview"))}
            title={mode === "preview" ? t("synopsisEditButton") : t("synopsisPreviewButton")}
            aria-label={mode === "preview" ? t("synopsisEditButton") : t("synopsisPreviewButton")}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            {mode === "preview" ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
      </div>

      {mode === "preview" ? (
        <div className="min-h-32 rounded-md border border-gray-200 bg-gray-50 p-3">
          <TranslatableContent sourceLanguage={sourceLanguage} enableDictionary={enableDictionary} studentLessonId={studentLessonId}>
            <Markdown content={value} embedYoutube embedPdf />
          </TranslatableContent>
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={20}
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900"
        />
      )}
    </div>
  );
}
