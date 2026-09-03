"use client";

import { useTranslations } from "next-intl";
import { mergeSimpleRows, SimpleLessonTable } from "@/components/simple-lesson-table";
import type { BacklogItemOut, CalendarItemOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

// Notion-style, monochrome alternative to the Standard dashboard's card
// list — see the Settings page's "Вигляд" section
// (components/settings/view-settings.tsx). Merges today's lessons and the
// backlog into one flat, sortable table (SimpleLessonTable) rather than the
// Standard view's two separate sections — a flat sortable table is the
// whole point of this view. The Simple calendar
// (components/calendar/simple-calendar.tsx) reuses the same table.
export function SimpleDashboard({ lessons, backlog }: { lessons: CalendarItemOut[]; backlog: BacklogItemOut[] }) {
  const t = useTranslations("StudentDashboard");
  return <SimpleLessonTable rows={mergeSimpleRows(lessons, backlog)} emptyMessage={t("empty")} />;
}
