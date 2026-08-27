import { create } from "zustand";
import { persist } from "zustand/middleware";

// Client-side view preferences for the Subject detail page (student's
// CoursePlan and the tutor's TutorSubjectDetailPage). Persisted to
// localStorage — unlike auth-store, this deliberately outlives the tab so
// that switching from one subject to another keeps the chosen view instead
// of resetting to the defaults every time.

export type CoursePlanViewMode = "brief" | "full";
export type TutorSubjectViewMode = "brief" | "full" | "student";

interface SubjectViewState {
  coursePlanViewMode: CoursePlanViewMode;
  setCoursePlanViewMode: (mode: CoursePlanViewMode) => void;
  // Sticky "expand all" / "collapse all" choice for the topic accordions.
  // null = no explicit choice made yet — callers fall back to their own
  // per-page default (e.g. the student page auto-expands the current topic).
  coursePlanTopicsExpanded: boolean | null;
  setCoursePlanTopicsExpanded: (expanded: boolean | null) => void;

  tutorViewMode: TutorSubjectViewMode;
  setTutorViewMode: (mode: TutorSubjectViewMode) => void;
  tutorTopicsExpanded: boolean | null;
  setTutorTopicsExpanded: (expanded: boolean | null) => void;
}

export const useSubjectViewStore = create<SubjectViewState>()(
  persist(
    (set) => ({
      coursePlanViewMode: "brief",
      setCoursePlanViewMode: (coursePlanViewMode) => set({ coursePlanViewMode }),
      coursePlanTopicsExpanded: null,
      setCoursePlanTopicsExpanded: (coursePlanTopicsExpanded) => set({ coursePlanTopicsExpanded }),

      tutorViewMode: "brief",
      setTutorViewMode: (tutorViewMode) => set({ tutorViewMode }),
      tutorTopicsExpanded: null,
      setTutorTopicsExpanded: (tutorTopicsExpanded) => set({ tutorTopicsExpanded }),
    }),
    { name: "subject-view-store" },
  ),
);
