import { create } from "zustand";
import { persist } from "zustand/middleware";

// Display preferences for the "Прогрес по предметах" list
// (components/subject-progress-list.tsx) — shared by the student's own
// dashboard and the tutor's per-student stats tab. Persisted to
// localStorage, same pattern as stores/subjects-grouped-view-store.ts.
export type SubjectProgressView = "grouped" | "ungrouped";
export type SubjectProgressSort = "default" | "name" | "progress_asc" | "progress_desc";

interface SubjectProgressViewState {
  view: SubjectProgressView;
  setView: (view: SubjectProgressView) => void;
  sort: SubjectProgressSort;
  setSort: (sort: SubjectProgressSort) => void;
}

export const useSubjectProgressViewStore = create<SubjectProgressViewState>()(
  persist(
    (set) => ({
      view: "ungrouped",
      setView: (view) => set({ view }),
      sort: "default",
      setSort: (sort) => set({ sort }),
    }),
    { name: "subject-progress-view-store" },
  ),
);
