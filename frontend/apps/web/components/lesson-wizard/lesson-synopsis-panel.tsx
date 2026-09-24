"use client";

import { useEffect, useRef, useState } from "react";
import { SynopsisEditor } from "@/components/synopsis-editor";

const AUTOSAVE_DELAY_MS = 1000;

// The конспект side panel of the "Теорія" tab once a student toggles it
// visible (lesson-wizard.tsx) — the right column of LessonPanels, next to
// the lesson's own content (the editor itself is the shared SynopsisEditor).
// Also reused as-is by the tutor's own Lesson detail page
// (tutor/tutor-lesson-detail-page.tsx), which edits the lesson's original
// Lesson.synopsis instead of a per-student copy — each caller owns its own
// save mutation (they persist to different endpoints) and passes it in via
// `onSave`/`isSaving`, so this component only owns the autosave debounce.
export function LessonSynopsisPanel({
  studentLessonId,
  synopsis,
  onSave,
  isSaving,
  enableDictionary = true,
}: {
  studentLessonId?: number;
  synopsis: string;
  onSave: (value: string) => void;
  isSaving?: boolean;
  enableDictionary?: boolean;
}) {
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
    <SynopsisEditor
      value={notes}
      onChange={handleNotesChange}
      isSaving={isSaving}
      studentLessonId={studentLessonId}
      enableDictionary={enableDictionary}
    />
  );
}
