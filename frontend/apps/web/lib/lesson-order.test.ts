import { describe, expect, it } from "vitest";
import { numberLessonItems, sortLessonItems } from "./lesson-order";
import type { CalendarItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

function item(overrides: Partial<CalendarItemOut> & { id: number }): CalendarItemOut {
  return {
    lesson_id: overrides.id,
    subject_id: 1,
    lesson_title: "Lesson",
    topic_title: "Topic",
    subject_name: "Subject",
    topic_order_index: 1,
    lesson_order_index: 1,
    status: "assigned",
    scheduled_date: "2026-09-01",
    completed_at: null,
    is_completed_ahead: false,
    grade_points: null,
    grade_result: null,
    lesson_icon: null,
    subject_icon: null,
    subject_color: null,
    lesson_type: "theory",
    task_content: "",
    ...overrides,
  };
}

describe("sortLessonItems", () => {
  it("sorts by subject name alphabetically", () => {
    const items = [
      item({ id: 1, subject_name: "Історія" }),
      item({ id: 2, subject_name: "Алгебра" }),
      item({ id: 3, subject_name: "Біологія" }),
    ];

    expect(sortLessonItems(items).map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it("breaks ties within a subject by topic order_index, then lesson order_index", () => {
    const items = [
      item({ id: 1, subject_name: "Math", topic_order_index: 2, lesson_order_index: 1 }),
      item({ id: 2, subject_name: "Math", topic_order_index: 1, lesson_order_index: 2 }),
      item({ id: 3, subject_name: "Math", topic_order_index: 1, lesson_order_index: 1 }),
    ];

    expect(sortLessonItems(items).map((i) => i.id)).toEqual([3, 2, 1]);
  });

  it("does not mutate the input array", () => {
    const items = [item({ id: 1, subject_name: "B" }), item({ id: 2, subject_name: "A" })];
    const original = [...items];

    sortLessonItems(items);

    expect(items).toEqual(original);
  });
});

describe("numberLessonItems", () => {
  it("assigns 1-based positions in the given order", () => {
    const items = [item({ id: 10 }), item({ id: 20 }), item({ id: 30 })];

    const numberById = numberLessonItems(items);

    expect(numberById.get(10)).toBe(1);
    expect(numberById.get(20)).toBe(2);
    expect(numberById.get(30)).toBe(3);
  });
});
