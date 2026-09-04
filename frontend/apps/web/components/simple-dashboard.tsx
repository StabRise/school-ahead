"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useGetWeeklyProgress } from "@school-ahead/api-client/browser/schedule/schedule";
import { useListMyAchievements } from "@school-ahead/api-client/browser/achievements/achievements";
import { ProgressBar } from "@/components/progress-bar";
import { mergeSimpleRows, SimpleLessonTable } from "@/components/simple-lesson-table";
import { useSimpleDashboardStore } from "@/stores/simple-dashboard-store";
import type { BacklogItemOut, CalendarItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

// Local (not UTC) YYYY-MM-DD / Monday-of-week — same rule as
// student-dashboard.tsx's identical helpers.
function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const weekday = result.getDay();
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
  result.setDate(result.getDate() + diffToMonday);
  result.setHours(0, 0, 0, 0);
  return result;
}

const WEEKDAY_LABEL_FORMAT = new Intl.DateTimeFormat("uk-UA", { weekday: "short" });

// Collapsible, borderless section header — a tiny grey chevron + label
// toggling its body, open/closed state owned by the caller (persisted via
// simple-dashboard-store) instead of local component state.
function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        {isOpen ? (
          <ChevronUp className="size-4 shrink-0 text-gray-400" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-gray-400" aria-hidden="true" />
        )}
        {title}
      </button>
      {isOpen && children}
    </div>
  );
}

// Borderless take on the Standard dashboard's WeeklyProgressCard — same
// Mon-Sun completed-lesson bar chart, no card border. `colorful` restores
// the original blue bars instead of Simple's flat grey. Renders nothing
// while loading/erroring/empty, same as the Standard card.
function SimpleWeeklyProgress({ colorful }: { colorful?: boolean }) {
  const t = useTranslations("StudentDashboard");
  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const { data } = useGetWeeklyProgress({ week_start: toLocalIsoDate(weekStart) });
  const days = data?.days ?? [];

  if (days.length === 0) {
    return null;
  }

  const maxCount = Math.max(1, ...days.map((day) => day.completed_count));
  const MAX_BAR_HEIGHT_PX = 64;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-2" style={{ height: MAX_BAR_HEIGHT_PX + 20 }}>
        {days.map((day) => (
          <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs font-medium text-gray-700">{day.completed_count}</span>
            <div
              className={`w-full rounded-t-sm ${
                day.completed_count > 0 ? (colorful ? "bg-blue-200" : "bg-gray-400") : "bg-gray-100"
              }`}
              style={{
                height: day.completed_count > 0 ? (day.completed_count / maxCount) * MAX_BAR_HEIGHT_PX : 2,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between gap-2">
        {days.map((day) => (
          <span key={day.date} className="flex-1 text-center text-[10px] uppercase text-gray-400">
            {WEEKDAY_LABEL_FORMAT.format(new Date(`${day.date}T00:00:00`))}
          </span>
        ))}
      </div>
      <ProgressBar percent={data?.completed_percent ?? 0} label={t("weeklyPercentLabel")} colorful={colorful} />
    </div>
  );
}

// Borderless take on the Standard dashboard's SubjectStatsCard — same
// per-subject completion bars, no card border. Renders nothing while empty,
// same as the Standard card.
function SimpleSubjectStats({ colorful }: { colorful?: boolean }) {
  const { data } = useListMyAchievements();
  const subjects = data ?? [];

  if (subjects.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-3">
      {subjects.map((subject) => (
        <li key={subject.subject_id}>
          <ProgressBar percent={subject.completed_percent} label={subject.subject_name} colorful={colorful} />
        </li>
      ))}
    </ul>
  );
}

// Shared by both the Simple view (colorful=false) and the Default view
// (colorful=true) — same dense table + collapsible stats section either
// way; only status badges, overdue dates, the histogram, and progress bars
// change color. See components/student-dashboard.tsx.
export function SimpleDashboard({
  lessons,
  backlog,
  colorful,
}: {
  lessons: CalendarItemOut[];
  backlog: BacklogItemOut[];
  colorful?: boolean;
}) {
  const t = useTranslations("StudentDashboard");
  const statisticsOpen = useSimpleDashboardStore((state) => state.statisticsOpen);
  const setStatisticsOpen = useSimpleDashboardStore((state) => state.setStatisticsOpen);

  return (
    <div className="flex flex-col gap-4">
      <SimpleLessonTable rows={mergeSimpleRows(lessons, backlog)} emptyMessage={t("empty")} colorful={colorful} />

      <CollapsibleSection
        title={t("statisticsSectionTitle")}
        isOpen={statisticsOpen}
        onToggle={() => setStatisticsOpen(!statisticsOpen)}
      >
        <div className="grid grid-cols-1 gap-6 pl-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-medium text-gray-500">{t("weeklyProgressTitle")}</h4>
            <SimpleWeeklyProgress colorful={colorful} />
          </div>
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-medium text-gray-500">{t("statsTitle")}</h4>
            <SimpleSubjectStats colorful={colorful} />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
