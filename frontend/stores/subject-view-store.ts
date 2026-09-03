import { create } from "zustand";
import { persist } from "zustand/middleware";

// Client-side view preferences for the Subject detail page (student's
// CoursePlan and the tutor's TutorSubjectDetailPage). Persisted to
// localStorage — unlike auth-store, this deliberately outlives the tab so
// that switching from one subject to another keeps the chosen view instead
// of resetting to the defaults every time.

export type CoursePlanViewMode = "brief" | "full";

interface SubjectViewState {
  coursePlanViewMode: CoursePlanViewMode;
  setCoursePlanViewMode: (mode: CoursePlanViewMode) => void;
  // Sticky "expand all" / "collapse all" choice for the topic accordions.
  // null = no explicit choice made yet — callers fall back to their own
  // per-page default (e.g. the student page auto-expands the current topic).
  coursePlanTopicsExpanded: boolean | null;
  setCoursePlanTopicsExpanded: (expanded: boolean | null) => void;

  // The tutor's Subject detail page no longer has a brief/full/student view
  // toggle — one merged view always shows everything — but keeps its own
  // sticky expand/collapse-all preference for the topic accordions.
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

      tutorTopicsExpanded: null,
      setTutorTopicsExpanded: (tutorTopicsExpanded) => set({ tutorTopicsExpanded }),
    }),
    { name: "subject-view-store" },
  ),
);
