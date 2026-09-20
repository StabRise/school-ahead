// Which lessons the preschool subject page (components/subjects/preschool-
// subject-detail-page.tsx) shows — picked with the gear in its top-right
// corner and remembered for every subject (stores/preschool-lessons-filter-
// store.ts). The choice is sent to the server, which applies it and sends the
// lessons a page at a time (lessons.services.visible_subject_lessons — the rules
// live, and are tested, there):
//   "available" (default) — what the child can do right now: lessons not
//                           finished yet. This screen is "what can I do", not
//                           a log.
//   "all"                 — every lesson available to the child, finished ones
//                           included, for going back over old ones.
//   "favorites"           — only the ones marked with the heart on the lesson
//                           screen (StudentLesson.is_favorite), finished or not.
export type PreschoolLessonsFilter = "all" | "available" | "favorites";

export const PRESCHOOL_LESSONS_FILTERS: PreschoolLessonsFilter[] = ["available", "all", "favorites"];
