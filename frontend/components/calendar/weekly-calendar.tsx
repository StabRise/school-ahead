"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  useSchedulingApiBacklog,
  useSchedulingApiCalendar,
} from "@/lib/api/browser/schedule/schedule";
import type { BacklogItemOut, CalendarItemOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Card } from "@/components/card";
import { StatusBadge } from "@/components/status-badge";
import { GradePoints } from "@/components/grade-points";
import { PageContainer } from "@/components/page-container";

const WEEK_LENGTH = 7;
const DAY_LABEL_FORMAT = new Intl.DateTimeFormat("uk-UA", { weekday: "short", day: "numeric", month: "short" });
const RANGE_DAY_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });
const RANGE_DAY_YEAR_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", year: "numeric" });

// Local (not UTC) YYYY-MM-DD — avoids toISOString() shifting the date near
// midnight in timezones behind UTC.
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

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function formatWeekRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = sameMonth ? String(start.getDate()) : RANGE_DAY_FORMAT.format(start);
  return `${startLabel} – ${RANGE_DAY_YEAR_FORMAT.format(end)}`;
}

function LessonCard({ item }: { item: CalendarItemOut }) {
  return (
    <Card href={`/lessons/${item.id}`} className="flex flex-col gap-1">
      <p className="truncate text-sm font-medium">{item.lesson_title}</p>
      <p className="truncate text-xs text-gray-500">{item.subject_name}</p>
      <div className="flex items-center gap-2">
        <StatusBadge status={item.status} />
        {item.grade_points != null && <GradePoints points={item.grade_points} />}
      </div>
    </Card>
  );
}

function BacklogCard({ item }: { item: BacklogItemOut }) {
  const t = useTranslations("Calendar");

  return (
    <Card href={`/lessons/${item.id}`} className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.lesson_title}</p>
        <p className="truncate text-xs text-gray-500">{item.subject_name}</p>
        <p className="truncate text-xs text-amber-700">{t("backlogOrigin", { label: item.origin_label })}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.grade_points != null && <GradePoints points={item.grade_points} />}
        <StatusBadge status={item.status} />
      </div>
    </Card>
  );
}

function NavButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      {children}
    </button>
  );
}

export function WeeklyCalendar() {
  const t = useTranslations("Calendar");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const weekDays = useMemo(
    () => Array.from({ length: WEEK_LENGTH }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  const calendarQuery = useSchedulingApiCalendar({ week_start: toLocalIsoDate(weekStart) });
  const backlogQuery = useSchedulingApiBacklog();

  const items = calendarQuery.data ?? [];
  const backlog = backlogQuery.data ?? [];

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItemOut[]>();
    for (const item of calendarQuery.data ?? []) {
      const dayItems = map.get(item.scheduled_date) ?? [];
      dayItems.push(item);
      map.set(item.scheduled_date, dayItems);
    }
    return map;
  }, [calendarQuery.data]);

  const totalCount = items.length;
  const completedCount = items.filter((item) => item.status === "completed").length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <PageContainer title={t("title")} maxWidthClassName="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <NavButton onClick={() => setWeekStart((prev) => addDays(prev, -7))} label={t("previousWeek")}>
            ←
          </NavButton>
          <span className="text-sm font-medium">{formatWeekRange(weekDays[0], weekDays[WEEK_LENGTH - 1])}</span>
          <NavButton onClick={() => setWeekStart((prev) => addDays(prev, 7))} label={t("nextWeek")}>
            →
          </NavButton>
        </div>
        <NavButton onClick={() => setWeekStart(startOfWeek(new Date()))} label={t("today")}>
          {t("today")}
        </NavButton>
      </div>

      {!calendarQuery.isLoading && !calendarQuery.isError && totalCount > 0 && (
        <div className="mb-6">
          <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
            <span>{t("progress", { completed: completedCount, total: totalCount })}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-gray-900" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      {calendarQuery.isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {calendarQuery.isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {!calendarQuery.isLoading && !calendarQuery.isError && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          {weekDays.map((day) => {
            const dateKey = toLocalIsoDate(day);
            const dayItems = itemsByDate.get(dateKey) ?? [];
            return (
              <div key={dateKey} className="flex flex-col gap-2">
                <div className="text-xs font-medium text-gray-500 capitalize">
                  {DAY_LABEL_FORMAT.format(day)}
                </div>
                <div className="flex flex-col gap-2">
                  {dayItems.length === 0 && <p className="text-xs text-gray-400">{t("noLessons")}</p>}
                  {dayItems.map((item) => (
                    <LessonCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!backlogQuery.isLoading && !backlogQuery.isError && backlog.length > 0 && (
        <div className="mt-8 flex flex-col gap-2">
          <h3 className="text-lg font-semibold">{t("backlogTitle")}</h3>
          <p className="-mt-1 mb-1 text-sm text-gray-500">{t("backlogHint")}</p>
          <ul className="flex flex-col gap-2">
            {backlog.map((item) => (
              <li key={item.id}>
                <BacklogCard item={item} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageContainer>
  );
}
