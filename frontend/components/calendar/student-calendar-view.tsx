"use client";

import { useAuthStore } from "@/stores/auth-store";
import { SimpleCalendar } from "./simple-calendar";
import { PreschoolCalendar } from "@/components/preschool/calendar-view";

// Preschool keeps its own experience; Default and Simple now share the same
// SimpleCalendar component — Default just turns `colorful` on. See
// docs/interfaces/preschool.md and the Settings page's "Вигляд" section
// (components/settings/view-settings.tsx).
export function StudentCalendarView() {
  const interfaceMode = useAuthStore((state) => state.user?.interfaceMode);

  if (interfaceMode === "preschool") {
    return <PreschoolCalendar />;
  }
  return <SimpleCalendar colorful={interfaceMode !== "simple"} />;
}
