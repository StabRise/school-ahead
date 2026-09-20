import { describe, expect, it } from "vitest";
import { lessonExitHref } from "./lesson-exit";

describe("lessonExitHref", () => {
  it("goes back to the dashboard when the lesson was opened from it", () => {
    expect(lessonExitHref("/", 7)).toBe("/");
  });

  it("goes back to the road when the lesson was opened from it", () => {
    expect(lessonExitHref("/lessons", 7)).toBe("/lessons");
  });

  it("goes to the lesson's subject page from anywhere else", () => {
    expect(lessonExitHref("/subjects/7", 7)).toBe("/subjects/7");
    expect(lessonExitHref("/subjects/7", 9)).toBe("/subjects/9");
    expect(lessonExitHref("/calendar", 7)).toBe("/subjects/7");
    expect(lessonExitHref("/lessons/preview/12", 7)).toBe("/subjects/7");
  });

  it("goes to the subject page when it's unknown where the child came from", () => {
    expect(lessonExitHref(null, 7)).toBe("/subjects/7");
  });

  it("falls back to the dashboard while the subject isn't known yet", () => {
    expect(lessonExitHref("/subjects/7", null)).toBe("/");
    expect(lessonExitHref(null, null)).toBe("/");
  });
});
