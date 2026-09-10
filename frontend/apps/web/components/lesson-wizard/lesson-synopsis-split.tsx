"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetStudentLessonQueryKey,
  useUpdateStudentLessonSynopsis,
} from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import type { LessonAttachmentOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { MarkdownEditor } from "@/components/markdown-editor";
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
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPercent, setLeftPercent] = useState(55);
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

      <div className="flex flex-col gap-1 overflow-y-auto pl-3" style={{ width: `${100 - leftPercent}%` }}>
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700">{t("synopsisPanelLabel")}</label>
          {updateSynopsis.isPending && <span className="text-xs text-gray-400">{t("synopsisSaving")}</span>}
        </div>
        <MarkdownEditor value={notes} onChange={handleNotesChange} rows={20} />
      </div>
    </div>
  );
}
