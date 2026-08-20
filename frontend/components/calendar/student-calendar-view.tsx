"use client";

import { useAuthStore } from "@/stores/auth-store";
import { WeeklyCalendar } from "./weekly-calendar";
import { PreschoolCalendar } from "@/components/preschool/calendar-view";

// Both interface modes share the same route/data — this just picks which
// experience renders it. See docs/interfaces/preschool.md.
export function StudentCalendarView() {
  const isPreschool = useAuthStore((state) => state.user?.interfaceMode === "preschool");

  if (isPreschool) {
    return <PreschoolCalendar />;
  }
  return <WeeklyCalendar />;
}
