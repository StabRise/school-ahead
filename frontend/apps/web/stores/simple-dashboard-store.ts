import { create } from "zustand";
import { persist } from "zustand/middleware";

// Client-side open/closed state for the Simple dashboard's "Статистика"
// section (which holds "Виконано за тиждень" and "Прогрес по предметах" as
// its two columns) — persisted to localStorage (same pattern as
// subject-view-store) so a student's choice survives a reload instead of
// resetting every visit.

interface SimpleDashboardState {
  statisticsOpen: boolean;
  setStatisticsOpen: (open: boolean) => void;
}

export const useSimpleDashboardStore = create<SimpleDashboardState>()(
  persist(
    (set) => ({
      statisticsOpen: true,
      setStatisticsOpen: (statisticsOpen) => set({ statisticsOpen }),
    }),
    { name: "simple-dashboard-store" },
  ),
);
