import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PreschoolLessonsFilter } from "@/lib/preschool-lessons-filter";

// Which lessons the preschool subject page shows (see lib/preschool-lessons-
// filter.ts for what each option means) — a display preference kept on this
// device only, and shared by every subject rather than kept per subject:
// persisted to localStorage so it survives a reload, same pattern as
// stores/subjects-grouped-view-store.ts.
interface PreschoolLessonsFilterState {
  filter: PreschoolLessonsFilter;
  setFilter: (filter: PreschoolLessonsFilter) => void;
}

export const usePreschoolLessonsFilterStore = create<PreschoolLessonsFilterState>()(
  persist(
    (set) => ({
      filter: "available",
      setFilter: (filter) => set({ filter }),
    }),
    { name: "preschool-lessons-filter-store" },
  ),
);
