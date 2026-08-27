// Lesson.lesson_type's left-border accent on lesson rows — dark,
// high-contrast hues so the bar reads at a glance without a text badge.
// Shared by the tutor's Subject detail page and the student's Course plan
// accordion (see ContentTypeBadges for the older badge-based rendering,
// still used where a badge — not a border — is the right amount of ink).
const LESSON_TYPE_BORDER_COLOR: Record<string, string> = {
  theory: "#166534",
  with_quiz: "#991B1B",
  with_task: "#1E3A8A",
};

const DEFAULT_BORDER_COLOR = "#D1D5DB";

export function getLessonTypeBorderColor(lessonType: string): string {
  return LESSON_TYPE_BORDER_COLOR[lessonType] ?? DEFAULT_BORDER_COLOR;
}
