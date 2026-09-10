"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { LessonAttachmentOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { SynopsisEditor } from "@/components/synopsis-editor";
import { LessonContent } from "./lesson-content";

const MIN_LEFT_PERCENT = 25;
const MAX_LEFT_PERCENT = 75;
const AUTOSAVE_DELAY_MS = 1000;

// Split view for the "Теорія" tab once a student toggles their конспект
// visible (lesson-wizard.tsx) — the lesson's own content on the left, an
// editable конспект on the right (the right column itself is the shared
// SynopsisEditor). Also reused as-is by the tutor's own Lesson detail page
// (tutor/tutor-lesson-detail-page.tsx), which edits the lesson's original
// Lesson.synopsis instead of a per-student copy — each caller owns its own
// save mutation (they persist to different endpoints) and passes it in via
// `onSave`/`isSaving`, so this component only owns the split layout, the
// draggable divider, and the autosave debounce. No split-pane library
// exists anywhere in this repo, and none is warranted for a single
// draggable divider — the divider is hand-rolled via pointer capture, the
// same technique components/profile/avatar-preview.tsx's own drag-resize
// handle uses.
export function LessonSynopsisSplit({
  studentLessonId,
  content,
  materials,
  synopsis,
  onSave,
  isSaving,
  enableDictionary = true,
}: {
  studentLessonId?: number;
  content: string;
  materials: LessonAttachmentOut[];
  synopsis: string;
  onSave: (value: string) => void;
  isSaving?: boolean;
  enableDictionary?: boolean;
}) {
  const t = useTranslations("LessonWizard");
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPercent, setLeftPercent] = useState(55);
  const [notes, setNotes] = useState(synopsis);
  // Mirrors `notes` for the unmount-flush effect below, which otherwise
  // closes over the value from its very first render (an empty deps array
  // means its cleanup never sees later `setNotes` calls).
  const notesRef = useRef(notes);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors `onSave` so the unmount-flush effect below (empty deps array)
  // always calls the caller's latest mutation, not the one from mount.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Flushes any pending autosave when the component unmounts (e.g. the
  // student/tutor toggles the panel closed or switches tabs right after
  // typing) so the last few keystrokes within the debounce window aren't
  // lost.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        onSaveRef.current(notesRef.current);
      }
    };
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
      onSaveRef.current(value);
    }, AUTOSAVE_DELAY_MS);
  };

  return (
    <div ref={containerRef} className="flex h-[70vh] w-full">
      <div className="overflow-y-auto pr-3" style={{ width: `${leftPercent}%` }}>
        <LessonContent content={content} materials={materials} studentLessonId={studentLessonId} />
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

      <div className="overflow-y-auto pl-3" style={{ width: `${100 - leftPercent}%` }}>
        <SynopsisEditor
          value={notes}
          onChange={handleNotesChange}
          isSaving={isSaving}
          studentLessonId={studentLessonId}
          enableDictionary={enableDictionary}
        />
      </div>
    </div>
  );
}
