// What tapping a lesson on a subject page does — picked with the ⚙️ on the
// bookshelf (`/subjects`, for every subject) and, for one subject, with the ⚙️ on
// its own page; remembered on this device (lesson-open-mode-store.ts):
//   "open" (default)  — the lesson opens: its own screen for a student, the
//                       read-only preview for a visitor who isn't signed in.
//   "fullscreen"      — the lesson's video plays fullscreen in the subject page's
//                       ▶ player, from that lesson on; a lesson with no video
//                       opens as usual.
export type LessonOpenMode = "open" | "fullscreen";

export const LESSON_OPEN_MODES: LessonOpenMode[] = ["open", "fullscreen"];

export const DEFAULT_LESSON_OPEN_MODE: LessonOpenMode = "open";

// A subject's own choice: one of the two above, or "inherit" — no choice of its own,
// so it follows the bookshelf's (the default for every subject).
export type SubjectLessonOpenMode = LessonOpenMode | "inherit";

export const SUBJECT_LESSON_OPEN_MODES: SubjectLessonOpenMode[] = ["inherit", ...LESSON_OPEN_MODES];

// The subject's own choice if it has one, otherwise the bookshelf's. `bySubject` is
// keyed by the subject id as a string (it is stored as JSON).
export function resolveLessonOpenMode(
  shelfMode: LessonOpenMode,
  bySubject: Readonly<Record<string, LessonOpenMode>>,
  subjectId: number,
): LessonOpenMode {
  return bySubject[String(subjectId)] ?? shelfMode;
}
