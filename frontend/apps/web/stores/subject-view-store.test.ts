import { beforeEach, describe, expect, it } from "vitest";
import { useSubjectViewStore } from "./subject-view-store";

describe("useSubjectViewStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useSubjectViewStore.setState({ tutorTopicsExpanded: null });
  });

  it("starts with no expand/collapse preference", () => {
    expect(useSubjectViewStore.getState().tutorTopicsExpanded).toBeNull();
  });

  it("updates the tutor expand preference", () => {
    useSubjectViewStore.getState().setTutorTopicsExpanded(false);
    expect(useSubjectViewStore.getState().tutorTopicsExpanded).toBe(false);
  });

  it("persists state to localStorage so it survives switching subjects", () => {
    useSubjectViewStore.getState().setTutorTopicsExpanded(true);

    const stored = JSON.parse(localStorage.getItem("subject-view-store") ?? "{}");
    expect(stored.state.tutorTopicsExpanded).toBe(true);
  });
});
