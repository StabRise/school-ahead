import { FileText, ListChecks, Monitor, type LucideIcon } from "lucide-react";

// Shared by every Simple-view lesson row (dashboard table, calendar,
// subject detail) — tiny grey icon per lesson type. Exported as a plain map
// (not a `getLessonTypeIcon()` helper) — eslint's react-hooks static-
// components check flags a component reference assigned from a function
// call as "created during render", so call sites look this up directly:
// `LESSON_TYPE_ICON[lessonType] ?? Monitor`.
export const LESSON_TYPE_ICON: Record<string, LucideIcon> = {
  theory: Monitor,
  with_task: FileText,
  with_quiz: ListChecks,
};
