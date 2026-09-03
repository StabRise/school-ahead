import { create } from "zustand";
import { persist } from "zustand/middleware";

// Client-side view preferences for the tutor's Subject detail page.
// Persisted to localStorage — unlike auth-store, this deliberately outlives
// the tab so that switching from one subject to another keeps the chosen
// preference instead of resetting to the default every time.

interface SubjectViewState {
  // The tutor's Subject detail page no longer has a brief/full/student view
  // toggle — one merged view always shows everything — but keeps its own
  // sticky expand/collapse-all preference for the topic accordions. The
  // student side's equivalent (CoursePlan's brief/full toggle) was removed
  // along with CoursePlan itself once the student Subject detail page
  // switched to SimpleSubjectDetailPage (always-expanded, no toggle).
  tutorTopicsExpanded: boolean | null;
  setTutorTopicsExpanded: (expanded: boolean | null) => void;
}

export const useSubjectViewStore = create<SubjectViewState>()(
  persist(
    (set) => ({
      tutorTopicsExpanded: null,
      setTutorTopicsExpanded: (tutorTopicsExpanded) => set({ tutorTopicsExpanded }),
    }),
    { name: "subject-view-store" },
  ),
);
