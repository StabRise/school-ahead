// Which lessons the preschool subject page (components/subjects/preschool-
// subject-detail-page.tsx) shows — picked with the gear in its top-right
// corner and remembered for every subject (stores/preschool-lessons-filter-
// store.ts):
//   "available" (default) — what the child can do right now: lessons not
//                           finished yet. This screen is "what can I do", not
//                           a log.
//   "all"                 — every lesson available to the child, finished ones
//                           included, for going back over old ones.
//   "favorites"           — only the ones marked with the heart on the lesson
//                           screen (StudentLesson.is_favorite), finished or not.
export type PreschoolLessonsFilter = "all" | "available" | "favorites";

export const PRESCHOOL_LESSONS_FILTERS: PreschoolLessonsFilter[] = ["available", "all", "favorites"];

export interface FilterableLesson {
  // Whether the student has a StudentLesson for it (tutor-assigned or picked
  // by themselves) — null id on the API means not assigned.
  isAssigned: boolean;
  status: string | null;
  isFavorite: boolean;
}

// A lesson the student has no StudentLesson for yet counts as available only
// when they may start any lesson themselves (StudentProfile.can_do_any_lesson
// — same rule as SimpleSubjectLessonRow); it can never be a favourite, since
// the mark lives on the StudentLesson.
export function isLessonShown(
  filter: PreschoolLessonsFilter,
  lesson: FilterableLesson,
  canDoAnyLesson: boolean,
): boolean {
  switch (filter) {
    case "favorites":
      return lesson.isAssigned && lesson.isFavorite;
    case "all":
      return lesson.isAssigned || canDoAnyLesson;
    case "available":
      return lesson.isAssigned ? lesson.status !== "completed" : canDoAnyLesson;
  }
}
