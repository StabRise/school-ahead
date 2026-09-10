"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTutorLessonQueryKey, useUpdateTutorLesson } from "@school-ahead/api-client/browser/tutor/tutor";
import type { LessonOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { SynopsisEditor } from "@/components/synopsis-editor";

const AUTOSAVE_DELAY_MS = 1000;

// The tutor's own quick-access конспект editor — toggled via the same
// icon button concept as the student wizard's (lesson-wizard.tsx), but
// editing Lesson.synopsis directly (the source every student's own copy
// forks from — see StudentLessonOut.resolve_synopsis) rather than a
// per-student copy. Reuses the same SynopsisEditor widget (preview/edit
// toggle, translate-on-select, language picker) as the student side, with
// "add to dictionary" turned off — that feature requires a StudentProfile
// a tutor account doesn't have. update_tutor_lesson has no partial-field
// PATCH, so every autosave resends the lesson's other fields unchanged.
export function LessonSynopsisPanel({ lesson }: { lesson: LessonOut }) {
  const queryClient = useQueryClient();
  const updateLesson = useUpdateTutorLesson();
  const [synopsis, setSynopsis] = useState(lesson.synopsis);
  // Mirrors `synopsis` for the unmount-flush effect below, which otherwise
  // closes over the value from its very first render.
  const synopsisRef = useRef(synopsis);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveSynopsis = (value: string) => {
    updateLesson.mutate(
      {
        lessonId: lesson.id,
        data: {
          title: lesson.title,
          content: lesson.content,
          task_content: lesson.task_content,
          synopsis: value,
          lesson_type: lesson.lesson_type,
          grading_type: lesson.grading_type,
        },
      },
      { onSuccess: (data) => queryClient.setQueryData(getGetTutorLessonQueryKey(lesson.id), data) },
    );
  };

  // Flushes any pending autosave when the panel unmounts (e.g. the tutor
  // toggles it closed right after typing) so the last few keystrokes
  // within the debounce window aren't lost.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveSynopsis(synopsisRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (value: string) => {
    setSynopsis(value);
    synopsisRef.current = value;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      saveSynopsis(value);
    }, AUTOSAVE_DELAY_MS);
  };

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <SynopsisEditor value={synopsis} onChange={handleChange} isSaving={updateLesson.isPending} enableDictionary={false} />
    </div>
  );
}
