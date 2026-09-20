import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LESSON_OPEN_MODE,
  LESSON_OPEN_MODES,
  SUBJECT_LESSON_OPEN_MODES,
  resolveLessonOpenMode,
} from "./lesson-open-mode";
import { useLessonOpenModeStore } from "./lesson-open-mode-store";

describe("lesson open mode", () => {
  beforeEach(() => {
    useLessonOpenModeStore.setState({ mode: DEFAULT_LESSON_OPEN_MODE, bySubject: {} });
  });

  it("opens the lesson by default — the behaviour before the setting existed", () => {
    expect(DEFAULT_LESSON_OPEN_MODE).toBe("open");
    expect(useLessonOpenModeStore.getState().mode).toBe("open");
  });

  it("offers both modes, the default first — and a subject may also follow the bookshelf", () => {
    expect(LESSON_OPEN_MODES).toEqual(["open", "fullscreen"]);
    expect(SUBJECT_LESSON_OPEN_MODES).toEqual(["inherit", "open", "fullscreen"]);
  });

  it("remembers the choice on this device", () => {
    useLessonOpenModeStore.getState().setMode("fullscreen");

    expect(useLessonOpenModeStore.getState().mode).toBe("fullscreen");
    expect(localStorage.getItem("preschool-lesson-open-mode-store")).toContain("fullscreen");
  });
});

describe("resolveLessonOpenMode", () => {
  it("follows the bookshelf for a subject with no choice of its own", () => {
    expect(resolveLessonOpenMode("fullscreen", {}, 69)).toBe("fullscreen");
    expect(resolveLessonOpenMode("open", { "12": "fullscreen" }, 69)).toBe("open");
  });

  it("lets a subject's own choice win, either way", () => {
    expect(resolveLessonOpenMode("open", { "69": "fullscreen" }, 69)).toBe("fullscreen");
    expect(resolveLessonOpenMode("fullscreen", { "69": "open" }, 69)).toBe("open");
  });
});

describe("a subject's own choice", () => {
  beforeEach(() => {
    useLessonOpenModeStore.setState({ mode: "open", bySubject: {} });
  });

  it("is kept per subject, without touching the bookshelf's or the others'", () => {
    const { setSubjectMode } = useLessonOpenModeStore.getState();

    setSubjectMode(69, "fullscreen");
    setSubjectMode(12, "open");

    const state = useLessonOpenModeStore.getState();
    expect(state.mode).toBe("open");
    expect(state.bySubject).toEqual({ "69": "fullscreen", "12": "open" });
  });

  it("is forgotten by choosing 'inherit' — the subject follows the bookshelf again", () => {
    const { setSubjectMode } = useLessonOpenModeStore.getState();
    setSubjectMode(69, "fullscreen");
    setSubjectMode(12, "open");

    setSubjectMode(69, "inherit");

    expect(useLessonOpenModeStore.getState().bySubject).toEqual({ "12": "open" });
  });

  it("is remembered on this device", () => {
    useLessonOpenModeStore.getState().setSubjectMode(69, "fullscreen");

    expect(localStorage.getItem("preschool-lesson-open-mode-store")).toContain('"69":"fullscreen"');
  });
});
