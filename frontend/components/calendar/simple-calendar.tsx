"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, ListChecks, Monitor, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useSchedulingApiBacklog, useSchedulingApiCalendar } from "@/lib/api/browser/schedule/schedule";
import { PageContainer } from "@/components/page-container";
import { sortLessonItems } from "@/lib/lesson-order";
import { STATUS_LABEL_KEY } from "@/components/status-badge";
import type { CalendarItemOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

type PeriodLength = 4 | 7 | 10;
const PERIODS: PeriodLength[] = [4, 7, 10];
const PERIOD_LABEL_KEY: Record<PeriodLength, string> = {
  4: "period4Days",
  7: "periodWeek",
  10: "period10Days",
};
// Static, fully-written class strings (not template-interpolated) so
// Tailwind's JIT scanner picks them up — one entry per selectable period.
const PERIOD_GRID_COLS: Record<PeriodLength, string> = {
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  7: "grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7",
  10: "grid-cols-1 sm:grid-cols-2 md:grid-cols-5 xl:grid-cols-10",
};

const DAY_LABEL_FORMAT = new Intl.DateTimeFormat("uk-UA", { weekday: "short", day: "numeric", month: "short" });
const RANGE_DAY_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });
const RANGE_DAY_YEAR_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", year: "numeric" });

// Local (not UTC) YYYY-MM-DD — same rule as weekly-calendar.tsx's identical
// helper, avoiding toISOString() shifting the date near midnight in
// timezones behind UTC.
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

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

// The weekly period stays Monday-aligned (matches WeeklyCalendar); the 4-
// and 10-day periods are a rolling window starting from today instead, like
// Google Calendar's custom day-count views.
function defaultRangeStart(period: PeriodLength): Date {
  return period === 7 ? startOfWeek(new Date()) : startOfDay(new Date());
}

function formatDateRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = sameMonth ? String(start.getDate()) : RANGE_DAY_FORMAT.format(start);
  return `${startLabel} – ${RANGE_DAY_YEAR_FORMAT.format(end)}`;
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

function PeriodSwitcher({ period, onChange }: { period: PeriodLength; onChange: (next: PeriodLength) => void }) {
  const t = useTranslations("Calendar");
  return (
    <div className="inline-flex rounded-md border border-gray-300 p-0.5 text-sm">
      {PERIODS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded px-3 py-1 font-medium ${
            period === option ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"
          }`}
        >
          {t(PERIOD_LABEL_KEY[option])}
        </button>
      ))}
    </div>
  );
}

const LESSON_TYPE_ICON: Record<string, LucideIcon> = {
  theory: Monitor,
  with_task: FileText,
  with_quiz: ListChecks,
};

// One lesson entry inside a day column — monochrome, tiny grey icon, subject
// and lesson title on their own lines, then status/grade/backlog-origin as
// small grey meta text below.
function SimpleDayLessonRow({ item, originLabel }: { item: CalendarItemOut; originLabel?: string }) {
  const t = useTranslations("LessonWizard");
  const tStatus = useTranslations("LessonStatus");
  const Icon = LESSON_TYPE_ICON[item.lesson_type] ?? Monitor;

  // Bare points (no "/12" denominator, unlike LessonWizard.scoreValue) —
  // this row's meta line is a compact calendar chip, not the graded-detail
  // badges elsewhere that spell out the score out of its max.
  const gradeLabel =
    item.grade_result === "pass"
      ? t("scorePass")
      : item.grade_result === "fail"
        ? t("scoreFail")
        : item.grade_points !== null
          ? String(item.grade_points)
          : null;

  const statusLabel = tStatus(STATUS_LABEL_KEY[item.status] ?? STATUS_LABEL_KEY.assigned);
  const metaParts = [originLabel ?? null, statusLabel, gradeLabel].filter(Boolean);

  return (
    <li>
      <Link href={`/lessons/${item.id}`} className="flex flex-col gap-0.5 rounded px-1.5 py-1 hover:bg-gray-50">
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon className="size-3.5 shrink-0 text-gray-400" aria-hidden="true" />
          <span className="truncate text-xs font-medium text-gray-900">{item.subject_name}</span>
        </span>
        <span className="truncate pl-5 text-xs text-gray-600">{item.lesson_title}</span>
        <span className="truncate pl-5 text-[11px] text-gray-400">{metaParts.join(" · ")}</span>
      </Link>
    </li>
  );
}

// Notion-style, monochrome alternative to WeeklyCalendar — same week-grid
// shape (a Google-Calendar-like weekly view, one column per day) and week
// navigation, plus a period switcher (4 days / week / 10 days), rendered
// with tiny grey icons/text instead of colored, bordered lesson cards. The
// backlog ("хвости") isn't a separate section like the Standard view's —
// it's folded directly into today's column, since a tail is exactly a
// lesson that should have happened by today. See the Settings page's
// "Вигляд" section (components/settings/view-settings.tsx).
export function SimpleCalendar() {
  const t = useTranslations("Calendar");
  const [period, setPeriod] = useState<PeriodLength>(7);
  const [rangeStart, setRangeStart] = useState(() => defaultRangeStart(7));
  const rangeDays = useMemo(
    () => Array.from({ length: period }, (_, index) => addDays(rangeStart, index)),
    [rangeStart, period],
  );
  const todayKey = useMemo(() => toLocalIsoDate(new Date()), []);

  const calendarQuery = useSchedulingApiCalendar({ week_start: toLocalIsoDate(rangeStart) });
  const backlogQuery = useSchedulingApiBacklog();

  const isLoading = calendarQuery.isLoading || backlogQuery.isLoading;
  const isError = calendarQuery.isError || backlogQuery.isError;

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItemOut[]>();
    for (const item of calendarQuery.data ?? []) {
      const dayItems = map.get(item.scheduled_date) ?? [];
      dayItems.push(item);
      map.set(item.scheduled_date, dayItems);
    }
    for (const [date, dayItems] of map) {
      map.set(date, sortLessonItems(dayItems));
    }
    return map;
  }, [calendarQuery.data]);

  const sortedBacklog = useMemo(() => sortLessonItems(backlogQuery.data ?? []), [backlogQuery.data]);

  const handlePeriodChange = (next: PeriodLength) => {
    if (next === period) return;
    setPeriod(next);
    setRangeStart(defaultRangeStart(next));
  };

  return (
    <PageContainer title={t("title")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <NavButton onClick={() => setRangeStart((prev) => addDays(prev, -period))} label={t("previousWeek")}>
            ←
          </NavButton>
          <span className="text-sm font-medium">
            {formatDateRange(rangeDays[0], rangeDays[period - 1])}
          </span>
          <NavButton onClick={() => setRangeStart((prev) => addDays(prev, period))} label={t("nextWeek")}>
            →
          </NavButton>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSwitcher period={period} onChange={handlePeriodChange} />
          <NavButton onClick={() => setRangeStart(defaultRangeStart(period))} label={t("today")}>
            {t("today")}
          </NavButton>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {!isLoading && !isError && (
        <div className={`grid gap-4 ${PERIOD_GRID_COLS[period]}`}>
          {rangeDays.map((day, index) => {
            const dateKey = toLocalIsoDate(day);
            const isToday = dateKey === todayKey;
            const dayItems = itemsByDate.get(dateKey) ?? [];
            // Tails are folded into today's column instead of a separate
            // backlog section — they only ever appear on the one column
            // that's actually "today" (navigating away from today simply
            // shows no tails, since there's no "today" column to fold them
            // into there).
            const backlogItems = isToday ? sortedBacklog : [];

            return (
              <div
                key={dateKey}
                className={`flex flex-col gap-2 ${index > 0 ? "lg:border-l lg:border-gray-100 lg:pl-4" : ""}`}
              >
                <div className={`text-xs font-medium capitalize ${isToday ? "text-gray-900" : "text-gray-400"}`}>
                  {DAY_LABEL_FORMAT.format(day)}
                </div>
                <ul className="flex flex-col gap-1">
                  {dayItems.length === 0 && backlogItems.length === 0 && (
                    <li className="text-xs text-gray-300">{t("noLessons")}</li>
                  )}
                  {dayItems.map((item) => (
                    <SimpleDayLessonRow key={item.id} item={item} />
                  ))}
                  {backlogItems.map((item) => (
                    <SimpleDayLessonRow
                      key={item.id}
                      item={item}
                      originLabel={RANGE_DAY_FORMAT.format(new Date(`${item.origin_label}T00:00:00`))}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
