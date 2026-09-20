import { describe, expect, it } from "vitest";
import type { PlaylistTrackOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { canStartTrack, markDoneState } from "./playlist-track-actions";

const track = (overrides: Partial<PlaylistTrackOut> = {}): PlaylistTrackOut => ({
  lesson_id: 1,
  title: "Song",
  video_id: "video000001",
  lesson_type: "theory",
  student_lesson_id: null,
  status: null,
  is_favorite: false,
  ...overrides,
});

describe("canStartTrack", () => {
  it("is true for a lesson the student already has", () => {
    expect(canStartTrack(track({ student_lesson_id: 5 }), false)).toBe(true);
  });

  it("needs can_do_any_lesson for a lesson they don't have yet", () => {
    expect(canStartTrack(track(), false)).toBe(false);
    expect(canStartTrack(track(), true)).toBe(true);
  });
});

describe("markDoneState", () => {
  it("offers a theory lesson that was never started, if the student may start it", () => {
    expect(markDoneState(track(), true)).toBe("available");
    expect(markDoneState(track(), false)).toBe("hidden");
  });

  it.each(["assigned", "in_progress"])("offers a theory lesson that is %s", (status) => {
    expect(markDoneState(track({ student_lesson_id: 5, status }), false)).toBe("available");
  });

  it("shows a completed lesson as done, whatever its type", () => {
    expect(markDoneState(track({ student_lesson_id: 5, status: "completed" }), false)).toBe("done");
    expect(markDoneState(track({ lesson_type: "with_quiz", student_lesson_id: 5, status: "completed" }), false)).toBe(
      "done",
    );
  });

  it.each(["with_quiz", "with_task"])("never offers a %s lesson — its quiz or review finishes it", (lessonType) => {
    expect(markDoneState(track({ lesson_type: lessonType, student_lesson_id: 5, status: "in_progress" }), true)).toBe(
      "hidden",
    );
  });

  it.each(["need_help", "pending_review", "revision_required"])("hides a lesson that is %s", (status) => {
    expect(markDoneState(track({ student_lesson_id: 5, status }), true)).toBe("hidden");
  });
});
