import type { CalendarItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

// Curriculum order for a list mixing lessons from several subjects (a
// calendar day, the dashboard's "today" list, a backlog): alphabetical by
// subject name (uk collation) first, then by that subject's own
// Topic.order_index and Lesson.order_index as the tiebreaker — see
// docs/core/schedule_planning.md.
export function compareLessonItems(a: CalendarItemOut, b: CalendarItemOut): number {
  return (
    a.subject_name.localeCompare(b.subject_name, "uk") ||
    a.topic_order_index - b.topic_order_index ||
    a.lesson_order_index - b.lesson_order_index
  );
}

export function sortLessonItems<T extends CalendarItemOut>(items: T[]): T[] {
  return [...items].sort(compareLessonItems);
}

// item.id -> its 1-based position in the sorted list — the display number
// shown next to each lesson.
export function numberLessonItems<T extends CalendarItemOut>(items: T[]): Map<number, number> {
  const numberById = new Map<number, number>();
  items.forEach((item, index) => numberById.set(item.id, index + 1));
  return numberById;
}
