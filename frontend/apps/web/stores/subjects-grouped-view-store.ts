import { create } from "zustand";
import { persist } from "zustand/middleware";

// Whether the student's subjects list (components/subjects/simple-subjects-page.tsx)
// is split into per-group tabs or shown as one flat, sortable table — purely
// a display preference, persisted to localStorage so it survives a reload
// instead of resetting every visit, same pattern as
// stores/simple-dashboard-store.ts.
interface SubjectsGroupedViewState {
  grouped: boolean;
  setGrouped: (grouped: boolean) => void;
}

export const useSubjectsGroupedViewStore = create<SubjectsGroupedViewState>()(
  persist(
    (set) => ({
      grouped: false,
      setGrouped: (grouped) => set({ grouped }),
    }),
    { name: "subjects-grouped-view-store" },
  ),
);
