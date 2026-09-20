import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SUBJECTS_DISPLAY_MODE, type SubjectsDisplayMode } from "./subjects-display";

// Which subjects the preschool bookshelf shows (see subjects-display.ts) — a
// display preference kept on this device only, persisted to localStorage so it
// survives a reload; same pattern as the subject page's lessons filter
// (apps/web/stores/preschool-lessons-filter-store.ts).
interface SubjectsDisplayState {
  mode: SubjectsDisplayMode;
  setMode: (mode: SubjectsDisplayMode) => void;
}

export const useSubjectsDisplayStore = create<SubjectsDisplayState>()(
  persist(
    (set) => ({
      mode: DEFAULT_SUBJECTS_DISPLAY_MODE,
      setMode: (mode) => set({ mode }),
    }),
    { name: "preschool-subjects-display-store" },
  ),
);
