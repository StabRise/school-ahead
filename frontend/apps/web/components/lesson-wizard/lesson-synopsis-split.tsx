"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil } from "lucide-react";
import {
  getGetStudentLessonQueryKey,
  useUpdateStudentLessonSynopsis,
} from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import type { SpeechLanguage } from "@school-ahead/api-client";
import type { LessonAttachmentOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Markdown } from "@/components/markdown";
import { TranslatableContent } from "@/components/translatable-content";
import { LANGUAGE_OPTIONS } from "@/components/read-along-control-panel";
import { useSynopsisLanguageStore } from "@/stores/synopsis-language-store";
import { LessonContent } from "./lesson-content";

const MIN_LEFT_PERCENT = 25;
const MAX_LEFT_PERCENT = 75;
const AUTOSAVE_DELAY_MS = 1000;

// Split view for the "Теорія" tab once a student toggles their конспект
// visible (lesson-wizard.tsx) — the lesson's own content on the left, the
// student's own editable copy of the teacher's конспект on the right (see
// StudentLessonOut.synopsis / backend StudentLesson.synopsis_notes's
// fork-on-first-edit semantics). No split-pane library exists anywhere in
// this repo, and none is warranted for a single draggable divider — the
// divider is hand-rolled via pointer capture, the same technique
// components/profile/avatar-preview.tsx's own drag-resize handle uses.
export function LessonSynopsisSplit({
  studentLessonId,
  content,
  materials,
  synopsis,
}: {
  studentLessonId: number;
  content: string;
  materials: LessonAttachmentOut[];
  synopsis: string;
}) {
  const t = useTranslations("LessonWizard");
  // LANGUAGE_OPTIONS' labelKeys are ReadAlong namespace keys (see
  // read-along-control-panel.tsx) — reused as-is rather than duplicated.
  const tReadAlong = useTranslations("ReadAlong");
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPercent, setLeftPercent] = useState(55);
  // Preview is the panel's default view (a student is more often reading
  // their notes than actively writing) — the icon button below switches to
  // the raw-markdown textarea on demand, same "Перегляд ⇄ Редагувати"
  // concept as MarkdownEditor, just icon-based instead of a text link so it
  // fits this panel's narrower header.
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  // Persisted across reloads/lessons (stores/synopsis-language-store.ts) —
  // a student's notes are usually in the same language everywhere, so
  // re-picking it on every visit would be needless friction.
  const sourceLanguage = useSynopsisLanguageStore((state) => state.synopsisLanguage);
  const setSourceLanguage = useSynopsisLanguageStore((state) => state.setSynopsisLanguage);
  const [notes, setNotes] = useState(synopsis);
  // Mirrors `notes` for the unmount-flush effect below, which otherwise
  // closes over the value from its very first render (an empty deps array
  // means its cleanup never sees later `setNotes` calls).
  const notesRef = useRef(notes);
  const updateSynopsis = useUpdateStudentLessonSynopsis();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The mutation's own cache isn't the wizard's useGetStudentLesson query —
  // without this, toggling the panel closed (unmounting this component) and
  // back open would re-seed `notes` from the stale pre-edit `synopsis` prop,
  // making the student's last save look reverted.
  const saveNotes = (value: string) => {
    updateSynopsis.mutate(
      { studentLessonId, data: { content: value } },
      { onSuccess: (data) => queryClient.setQueryData(getGetStudentLessonQueryKey(studentLessonId), data) },
    );
  };

  // Flushes any pending autosave when the component unmounts (e.g. the
  // student toggles the panel closed or switches tabs right after typing)
  // so the last few keystrokes within the debounce window aren't lost.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveNotes(notesRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleDividerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const percent = ((e.clientX - rect.left) / rect.width) * 100;
    setLeftPercent(Math.min(MAX_LEFT_PERCENT, Math.max(MIN_LEFT_PERCENT, percent)));
  };

  const handleDividerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    notesRef.current = value;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      saveNotes(value);
    }, AUTOSAVE_DELAY_MS);
  };

  return (
    <div ref={containerRef} className="flex h-[70vh] w-full">
      <div className="overflow-y-auto pr-3" style={{ width: `${leftPercent}%` }}>
        <LessonContent content={content} materials={materials} />
      </div>

      {/* stopPropagation not needed — this sits between two independent
          overflow-y-auto columns, not inside a click-toggle control. */}
      <div
        onPointerDown={handleDividerPointerDown}
        onPointerMove={handleDividerPointerMove}
        onPointerUp={handleDividerPointerUp}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("synopsisResizeHandleLabel")}
        className="w-1.5 shrink-0 cursor-col-resize touch-none rounded bg-gray-200 hover:bg-gray-300 active:bg-gray-400"
      />

      <div className="flex flex-col gap-2 overflow-y-auto pl-3" style={{ width: `${100 - leftPercent}%` }}>
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-medium text-gray-700">{t("synopsisPanelLabel")}</label>
          <div className="flex items-center gap-2">
            {updateSynopsis.isPending && <span className="text-xs text-gray-400">{t("synopsisSaving")}</span>}
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
              onClick={() => setMode((value) => (value === "preview" ? "edit" : "preview"))}
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
            <TranslatableContent sourceLanguage={sourceLanguage}>
              <Markdown content={notes} embedYoutube embedPdf />
            </TranslatableContent>
          </div>
        ) : (
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            rows={20}
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900"
          />
        )}
      </div>
    </div>
  );
}
