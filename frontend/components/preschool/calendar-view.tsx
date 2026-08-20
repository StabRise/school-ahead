"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  useSchedulingApiBacklog,
  useSchedulingApiCalendar,
} from "@/lib/api/browser/schedule/schedule";
import type { CalendarItemOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Cloud } from "@/components/preschool/decorations";
import { Raccoon } from "@/components/preschool/raccoon";
import { LessonBubble } from "@/components/preschool/lesson-bubble";
import { PreschoolBacklogSection } from "@/components/preschool/backlog-section";

// Cloud/Sun from decorations.tsx are hard-coded `position: absolute` (meant
// for background decoration) — these are plain in-flow versions for use
// inside cards.
function InlineSun({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`fill-amber-300 ${className}`} aria-hidden="true">
      <path d="M12 2l2.6 6.6L21 10l-5.5 4.6L17 21l-5-3.5L7 21l1.5-6.4L3 10l6.4-1.4z" />
    </svg>
  );
}

function InlineCloud({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={`fill-white ${className}`} aria-hidden="true">
      <ellipse cx="20" cy="24" rx="18" ry="14" />
      <ellipse cx="38" cy="18" rx="16" ry="16" />
      <ellipse cx="50" cy="26" rx="14" ry="11" />
    </svg>
  );
}

// A colorful, icon-first weekly calendar for 6-year-olds — big rainbow day
// cards instead of a dense text grid, round subject-icon bubbles instead of
// rows to read. See docs/interfaces/preschool.md.

const WEEK_LENGTH = 7;
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("uk-UA", { weekday: "short" });
const DAY_NUMBER_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });
const RANGE_DAY_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });
const RANGE_DAY_YEAR_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", year: "numeric" });

// One steady color per weekday (Mon..Sun) — stable across weeks so a child
// can learn "Monday is red" instead of colors shuffling around.
const DAY_COLORS = [
  { bg: "from-rose-300 to-rose-400", ring: "ring-rose-500" },
  { bg: "from-orange-300 to-orange-400", ring: "ring-orange-500" },
  { bg: "from-amber-300 to-amber-400", ring: "ring-amber-500" },
  { bg: "from-emerald-300 to-emerald-400", ring: "ring-emerald-500" },
  { bg: "from-sky-300 to-sky-400", ring: "ring-sky-500" },
  { bg: "from-indigo-300 to-indigo-400", ring: "ring-indigo-500" },
  { bg: "from-fuchsia-300 to-fuchsia-400", ring: "ring-fuchsia-500" },
];

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

function DayCard({ date, isToday, items }: { date: Date; isToday: boolean; items: CalendarItemOut[] }) {
  const t = useTranslations("PreschoolCalendar");
  // getDay(): 0=Sun..6=Sat -> reindex so Monday is 0, matching DAY_COLORS.
  const colorIndex = (date.getDay() + 6) % 7;
  const color = DAY_COLORS[colorIndex];

  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-[1.75rem] bg-gradient-to-b p-3 shadow-lg ${color.bg} ${
        isToday ? `ring-4 ring-offset-2 ${color.ring}` : ""
      }`}
    >
      <div className="flex flex-col items-center">
        <span className="text-base font-extrabold capitalize text-white drop-shadow-sm">
          {WEEKDAY_FORMAT.format(date)}
        </span>
        <span className="text-xs font-semibold text-white/90">{DAY_NUMBER_FORMAT.format(date)}</span>
      </div>

      {isToday && <InlineSun className="h-6 w-6" />}

      <div className="flex min-h-[3.75rem] w-full flex-wrap items-center justify-center gap-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-2 opacity-90">
            <InlineCloud className="h-6 w-9" />
            <span className="text-[11px] font-semibold text-white">{t("noLessons")}</span>
          </div>
        ) : (
          items.map((item) => <LessonBubble key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}

function NavButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl font-extrabold text-emerald-700 shadow-lg transition-transform hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      {children}
    </button>
  );
}

export function PreschoolCalendar() {
  const t = useTranslations("PreschoolCalendar");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const weekDays = useMemo(
    () => Array.from({ length: WEEK_LENGTH }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );
  const todayKey = useMemo(() => toLocalIsoDate(new Date()), []);

  const calendarQuery = useSchedulingApiCalendar({ week_start: toLocalIsoDate(weekStart) });
  const backlogQuery = useSchedulingApiBacklog();

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItemOut[]>();
    for (const item of calendarQuery.data ?? []) {
      const dayItems = map.get(item.scheduled_date) ?? [];
      dayItems.push(item);
      map.set(item.scheduled_date, dayItems);
    }
    return map;
  }, [calendarQuery.data]);

  const backlog = backlogQuery.data ?? [];

  return (
    <div className="relative flex flex-1 flex-col bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
      <div className="pointer-events-none absolute inset-0">
        <Cloud className="left-6 top-4 h-8 w-14 opacity-90" />
        <Cloud className="right-8 top-8 h-6 w-12 opacity-70" />
      </div>

      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 p-4 sm:p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Raccoon mood="idle" className="h-16 w-16" />
          <h1 className="text-2xl font-extrabold text-emerald-900">{t("title")}</h1>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <NavButton onClick={() => setWeekStart((prev) => addDays(prev, -7))} label={t("previousWeek")}>
            ←
          </NavButton>
          <span className="rounded-full bg-white/80 px-4 py-1.5 text-sm font-bold text-emerald-900 shadow">
            {formatWeekRange(weekDays[0], weekDays[WEEK_LENGTH - 1])}
          </span>
          <NavButton onClick={() => setWeekStart((prev) => addDays(prev, 7))} label={t("nextWeek")}>
            →
          </NavButton>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-full bg-amber-400 px-4 py-2 text-sm font-extrabold text-amber-950 shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            {t("today")}
          </button>
        </div>

        {calendarQuery.isLoading && <p className="text-center text-sm font-medium text-emerald-800">{t("loading")}</p>}
        {calendarQuery.isError && <p className="text-center text-sm font-medium text-red-700">{t("error")}</p>}

        {!calendarQuery.isLoading && !calendarQuery.isError && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
            {weekDays.map((day) => {
              const dateKey = toLocalIsoDate(day);
              return (
                <DayCard
                  key={dateKey}
                  date={day}
                  isToday={dateKey === todayKey}
                  items={itemsByDate.get(dateKey) ?? []}
                />
              );
            })}
          </div>
        )}

        {!backlogQuery.isLoading && !backlogQuery.isError && <PreschoolBacklogSection items={backlog} />}
      </div>
    </div>
  );
}
