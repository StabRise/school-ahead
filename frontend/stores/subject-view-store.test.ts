import { beforeEach, describe, expect, it } from "vitest";
import { useSubjectViewStore } from "./subject-view-store";

describe("useSubjectViewStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useSubjectViewStore.setState({
      coursePlanViewMode: "brief",
      coursePlanTopicsExpanded: null,
      tutorViewMode: "brief",
      tutorTopicsExpanded: null,
    });
  });

  it("starts with the brief view and no expand/collapse preference", () => {
    const state = useSubjectViewStore.getState();
    expect(state.coursePlanViewMode).toBe("brief");
    expect(state.coursePlanTopicsExpanded).toBeNull();
    expect(state.tutorViewMode).toBe("brief");
    expect(state.tutorTopicsExpanded).toBeNull();
  });

  it("updates the student course plan view independently of the tutor view", () => {
    useSubjectViewStore.getState().setCoursePlanViewMode("full");
    useSubjectViewStore.getState().setCoursePlanTopicsExpanded(true);

    const state = useSubjectViewStore.getState();
    expect(state.coursePlanViewMode).toBe("full");
    expect(state.coursePlanTopicsExpanded).toBe(true);
    expect(state.tutorViewMode).toBe("brief");
    expect(state.tutorTopicsExpanded).toBeNull();
  });

  it("updates the tutor view independently of the student course plan view", () => {
    useSubjectViewStore.getState().setTutorViewMode("student");
    useSubjectViewStore.getState().setTutorTopicsExpanded(false);

    const state = useSubjectViewStore.getState();
    expect(state.tutorViewMode).toBe("student");
    expect(state.tutorTopicsExpanded).toBe(false);
    expect(state.coursePlanViewMode).toBe("brief");
    expect(state.coursePlanTopicsExpanded).toBeNull();
  });

  it("persists state to localStorage so it survives switching subjects", () => {
    useSubjectViewStore.getState().setCoursePlanViewMode("full");
    useSubjectViewStore.getState().setCoursePlanTopicsExpanded(true);

    const stored = JSON.parse(localStorage.getItem("subject-view-store") ?? "{}");
    expect(stored.state.coursePlanViewMode).toBe("full");
    expect(stored.state.coursePlanTopicsExpanded).toBe(true);
  });
});
