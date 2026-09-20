import { describe, expect, it } from "vitest";
import { initialLessonStep, studentLessonHref } from "./lesson-step";

describe("initialLessonStep", () => {
  it("opens on the practice when the link says so", () => {
    expect(initialLessonStep("practice")).toBe("practice");
  });

  it.each([null, "", "theory", "quiz", "PRACTICE"])("opens on the content otherwise (%s)", (param) => {
    expect(initialLessonStep(param)).toBe("theory");
  });
});

describe("studentLessonHref", () => {
  it("is the plain lesson path by default", () => {
    expect(studentLessonHref(195)).toBe("/lessons/195");
    expect(studentLessonHref(195, "theory")).toBe("/lessons/195");
  });

  it("asks for the practice step", () => {
    expect(studentLessonHref(195, "practice")).toBe("/lessons/195?step=practice");
  });

  it("round-trips: the link opens the step it asked for", () => {
    const query = studentLessonHref(195, "practice").split("?")[1];
    expect(initialLessonStep(new URLSearchParams(query).get("step"))).toBe("practice");
  });
});
