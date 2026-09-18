import { describe, expect, it } from "vitest";
import { isLessonShown, type FilterableLesson } from "./preschool-lessons-filter";

const lesson = (overrides: Partial<FilterableLesson> = {}): FilterableLesson => ({
  isAssigned: true,
  status: "assigned",
  isFavorite: false,
  ...overrides,
});

describe("isLessonShown", () => {
  describe("available (default)", () => {
    it("shows assigned lessons that aren't finished", () => {
      for (const status of ["assigned", "in_progress", "need_help", "pending_review", "revision_required"]) {
        expect(isLessonShown("available", lesson({ status }), false)).toBe(true);
      }
    });

    it("hides finished lessons", () => {
      expect(isLessonShown("available", lesson({ status: "completed" }), true)).toBe(false);
    });

    it("shows unassigned lessons only when the student may start any lesson", () => {
      const unassigned = lesson({ isAssigned: false, status: null });
      expect(isLessonShown("available", unassigned, true)).toBe(true);
      expect(isLessonShown("available", unassigned, false)).toBe(false);
    });
  });

  describe("all", () => {
    it("also shows finished lessons", () => {
      expect(isLessonShown("all", lesson({ status: "completed" }), false)).toBe(true);
    });

    it("still gates unassigned lessons on can_do_any_lesson", () => {
      const unassigned = lesson({ isAssigned: false, status: null });
      expect(isLessonShown("all", unassigned, true)).toBe(true);
      expect(isLessonShown("all", unassigned, false)).toBe(false);
    });
  });

  describe("favorites", () => {
    it("shows favourites whatever their status, hides the rest", () => {
      expect(isLessonShown("favorites", lesson({ isFavorite: true, status: "completed" }), false)).toBe(true);
      expect(isLessonShown("favorites", lesson({ isFavorite: true, status: "assigned" }), false)).toBe(true);
      expect(isLessonShown("favorites", lesson({ isFavorite: false }), false)).toBe(false);
    });

    it("never shows a lesson without a StudentLesson", () => {
      const unassigned = lesson({ isAssigned: false, status: null, isFavorite: true });
      expect(isLessonShown("favorites", unassigned, true)).toBe(false);
    });
  });
});
