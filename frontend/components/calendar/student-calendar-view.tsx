"use client";

import { useAuthStore } from "@/stores/auth-store";
import { WeeklyCalendar } from "./weekly-calendar";
import { SimpleCalendar } from "./simple-calendar";
import { PreschoolCalendar } from "@/components/preschool/calendar-view";

// All three interface modes share the same route/data — this just picks
// which experience renders it. See docs/interfaces/preschool.md and the
// Settings page's "Вигляд" section (components/settings/view-settings.tsx).
export function StudentCalendarView() {
  const interfaceMode = useAuthStore((state) => state.user?.interfaceMode);

  if (interfaceMode === "preschool") {
    return <PreschoolCalendar />;
  }
  if (interfaceMode === "simple") {
    return <SimpleCalendar />;
  }
  return <WeeklyCalendar />;
}
