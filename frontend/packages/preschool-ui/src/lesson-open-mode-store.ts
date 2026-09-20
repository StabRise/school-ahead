import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_LESSON_OPEN_MODE,
  resolveLessonOpenMode,
  type LessonOpenMode,
  type SubjectLessonOpenMode,
} from "./lesson-open-mode";

// What tapping a lesson does (see lesson-open-mode.ts) — a display preference kept
// on this device only, for signed-in students and visitors alike; persisted to
// localStorage so it survives a reload, same pattern as subjects-display-store.ts.
// `mode` is the bookshelf's choice, for every subject; `bySubject` holds the
// subjects that have chosen for themselves (on their own page), which win over it.
interface LessonOpenModeState {
  mode: LessonOpenMode;
  setMode: (mode: LessonOpenMode) => void;
  bySubject: Record<string, LessonOpenMode>;
  // "inherit" forgets the subject's own choice.
  setSubjectMode: (subjectId: number, mode: SubjectLessonOpenMode) => void;
}

export const useLessonOpenModeStore = create<LessonOpenModeState>()(
  persist(
    (set) => ({
      mode: DEFAULT_LESSON_OPEN_MODE,
      setMode: (mode) => set({ mode }),
      bySubject: {},
      setSubjectMode: (subjectId, mode) =>
        set((state) => {
          const bySubject = { ...state.bySubject };
          if (mode === "inherit") delete bySubject[String(subjectId)];
          else bySubject[String(subjectId)] = mode;
          return { bySubject };
        }),
    }),
    { name: "preschool-lesson-open-mode-store" },
  ),
);

// What tapping a lesson of this subject does right now.
export function useLessonOpenMode(subjectId: number): LessonOpenMode {
  return useLessonOpenModeStore((state) => resolveLessonOpenMode(state.mode, state.bySubject, subjectId));
}

// The subject's own choice — "inherit" while it has none — for its ⚙️.
export function useSubjectLessonOpenMode(subjectId: number): SubjectLessonOpenMode {
  return useLessonOpenModeStore((state) => state.bySubject[String(subjectId)] ?? "inherit");
}
