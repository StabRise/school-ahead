"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Eye,
  Trash2,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ListOrdered,
  ListTodo,
  Monitor,
  LayoutList,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  getGetTutorStudentCalendarQueryKey,
  getSchedulingApiCalendarQueryKey,
  useGetTutorStudentCalendar,
  useSchedulingApiCalendar,
  useSchedulingApiReschedule,
} from "@school-ahead/api-client/browser/schedule/schedule";
import { useDeleteTutorStudentLesson } from "@school-ahead/api-client/browser/tutor/tutor";
import { PageContainer } from "@/components/page-container";
import { ProgressBar } from "@/components/progress-bar";
import { AddDayLessonDialog } from "@/components/calendar/add-day-lesson-dialog";
import { RescheduleDialog } from "@/components/calendar/reschedule-dialog";
import { sortLessonItems } from "@/lib/lesson-order";
import { LESSON_TYPE_ICON, LESSON_TYPE_ICON_COLOR } from "@/components/simple/lesson-type-icon";
import { formatGradeLabel, resolveStatusLabel } from "@/components/simple/format";
import { StatusBadge } from "@/components/status-badge";
import type { CalendarItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

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

const DRAG_DATA_TYPE = "application/x-student-lesson-id";

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
      title={label}
      aria-label={label}
      className="rounded-md border border-gray-200 p-1.5 text-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      {children}
    </button>
  );
}

// Segmented icon-button group shared by PeriodSwitcher and
// LessonFilterSwitcher below — a border, one rounded-square button per
// option, active option filled dark, every button's label given only as a
// tooltip/aria-label (never printed) since the icon carries the meaning.
function IconSegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  labelFor,
  iconFor,
}: {
  options: T[];
  value: T;
  onChange: (next: T) => void;
  labelFor: (option: T) => string;
  iconFor: (option: T) => React.ReactNode;
}) {
  return (
    <div className="inline-flex rounded-md border border-gray-300 p-0.5 text-sm">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          title={labelFor(option)}
          aria-label={labelFor(option)}
          aria-pressed={value === option}
          className={`rounded p-1.5 font-medium ${
            value === option ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"
          }`}
        >
          {iconFor(option)}
        </button>
      ))}
    </div>
  );
}

// Plain numeral (4/7/10) rather than a pictograph — no lucide icon
// distinguishes "4 days" from "10 days" from "a week", so the number itself
// is the icon here; the full label ("Тиждень", …) only ever shows as the
// button's tooltip, same convention as every other icon button in this bar.
function PeriodSwitcher({ period, onChange }: { period: PeriodLength; onChange: (next: PeriodLength) => void }) {
  const t = useTranslations("Calendar");
  return (
    <IconSegmentedControl
      options={PERIODS}
      value={period}
      onChange={onChange}
      labelFor={(option) => t(PERIOD_LABEL_KEY[option])}
      iconFor={(option) => <span className="inline-block w-4 text-center tabular-nums">{option}</span>}
    />
  );
}

type LessonFilter = "all" | "incomplete";
const LESSON_FILTERS: LessonFilter[] = ["all", "incomplete"];
const LESSON_FILTER_LABEL_KEY: Record<LessonFilter, string> = {
  all: "filterAll",
  incomplete: "filterIncomplete",
};
const LESSON_FILTER_ICON: Record<LessonFilter, typeof ListOrdered> = {
  all: ListTodo,
  incomplete: LayoutList,
};

function LessonFilterSwitcher({ filter, onChange }: { filter: LessonFilter; onChange: (next: LessonFilter) => void }) {
  const t = useTranslations("Calendar");
  return (
    <IconSegmentedControl
      options={LESSON_FILTERS}
      value={filter}
      onChange={onChange}
      labelFor={(option) => t(LESSON_FILTER_LABEL_KEY[option])}
      iconFor={(option) => {
        const Icon = LESSON_FILTER_ICON[option];
        return <Icon className="size-4" aria-hidden="true" />;
      }}
    />
  );
}

const iconButtonClasses = "rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700";

// One lesson entry inside a day column — monochrome, tiny grey icon, subject
// and lesson title on their own lines (dark red when `overdue`), then status
// as small grey meta text below (skipped once completed) and the grade, if
// any, pinned to the row's bottom-right corner. In tutor-management mode
// (`canManage`/`showTutorLinks`, set only when SimpleCalendar is given a
// `studentId`) the row also gets a trailing action line mirroring
// WeeklyCalendar's LessonCard: drag-to-reschedule, a "change date" button,
// "preview as student"/"open subject" links, and a delete button for
// still-unstarted assignments — same capabilities, monochrome styling.
function SimpleDayLessonRow({
  item,
  overdue,
  readOnly,
  canManage,
  showTutorLinks,
  colorful,
  onRequestReschedule,
  onRequestDelete,
}: {
  item: CalendarItemOut;
  overdue?: boolean;
  readOnly?: boolean;
  canManage?: boolean;
  showTutorLinks?: boolean;
  colorful?: boolean;
  onRequestReschedule?: (item: CalendarItemOut) => void;
  onRequestDelete?: (item: CalendarItemOut) => void;
}) {
  const t = useTranslations("LessonWizard");
  const tCalendar = useTranslations("Calendar");
  const tStatus = useTranslations("LessonStatus");
  const Icon = LESSON_TYPE_ICON[item.lesson_type] ?? Monitor;
  const iconColorClass = colorful ? (LESSON_TYPE_ICON_COLOR[item.lesson_type] ?? "text-gray-400") : "text-gray-400";
  const isCompleted = item.status === "completed";

  const gradeLabel = formatGradeLabel({
    gradePoints: item.grade_points,
    gradeResult: item.grade_result,
    t,
    bare: true,
  });

  // Status moves out of the plain-text meta line into a small colored
  // badge in colorful mode — same convention as the dashboard table. Once a
  // lesson is completed, the grade (bottom-right corner) already says
  // everything the status word would, so the label drops entirely instead.
  const statusLabel = isCompleted || colorful ? null : resolveStatusLabel(item.status, tStatus);
  const showActionRow = showTutorLinks || canManage;

  const stopDragStart = (e: React.MouseEvent) => e.stopPropagation();

  const content = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon className={`size-3.5 shrink-0 ${iconColorClass}`} aria-hidden="true" />
        <span className={`truncate text-xs font-medium ${overdue ? "text-red-900" : "text-gray-900"}`}>
          {item.subject_name}
        </span>
      </span>
      <span className={`truncate pl-5 text-xs ${overdue ? "text-red-900" : "text-gray-600"}`}>
        {item.lesson_title}
      </span>
      <span className="flex items-center gap-1.5 pl-5">
        {statusLabel && <span className="truncate text-[11px] text-gray-400">{statusLabel}</span>}
        {colorful && !isCompleted && <StatusBadge status={item.status} small />}
      </span>
      {gradeLabel && (
        <span className="absolute bottom-1 right-1.5 text-[11px] font-semibold text-gray-700">{gradeLabel}</span>
      )}
      {showActionRow && (
        <span className="flex items-center gap-1 pl-5">
          {showTutorLinks && (
            <>
              <Link
                href={`/tutor/lessons/${item.lesson_id}`}
                onMouseDown={stopDragStart}
                title={tCalendar("previewAsStudent")}
                aria-label={tCalendar("previewAsStudent")}
                className={iconButtonClasses}
              >
                <Eye className="size-3.5" aria-hidden="true" />
              </Link>
              <Link
                href={`/tutor/subjects/${item.subject_id}`}
                onMouseDown={stopDragStart}
                title={tCalendar("openSubject")}
                aria-label={tCalendar("openSubject")}
                className={iconButtonClasses}
              >
                <BookOpen className="size-3.5" aria-hidden="true" />
              </Link>
            </>
          )}
          {canManage && (
            <button
              type="button"
              onMouseDown={stopDragStart}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRequestReschedule?.(item);
              }}
              title={tCalendar("changeDate")}
              aria-label={tCalendar("changeDate")}
              className={iconButtonClasses}
            >
              <CalendarClock className="size-3.5" aria-hidden="true" />
            </button>
          )}
          {showTutorLinks && item.status === "assigned" && (
            <button
              type="button"
              onMouseDown={stopDragStart}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRequestDelete?.(item);
              }}
              title={tCalendar("removeLesson")}
              aria-label={tCalendar("removeLesson")}
              className="rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </span>
      )}
    </>
  );

  const rowClassName = `relative flex flex-col gap-0.5 rounded px-1.5 py-1 pr-6 hover:bg-gray-50 ${
    canManage ? "cursor-grab active:cursor-grabbing" : ""
  }`;

  if (readOnly) {
    return (
      <li>
        <div
          className={rowClassName}
          draggable={canManage}
          onDragStart={
            canManage
              ? (e) => {
                  e.dataTransfer.setData(DRAG_DATA_TYPE, String(item.id));
                  e.dataTransfer.effectAllowed = "move";
                }
              : undefined
          }
        >
          {content}
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link href={`/lessons/${item.id}`} className={rowClassName}>
        {content}
      </Link>
    </li>
  );
}

// The one calendar component for every student role/mode — a Google-
// Calendar-like weekly view (one column per day), week navigation, and a
// period switcher (4 days / week / 10 days). `colorful` (Default mode)
// restores colored status badges/lesson-type icons/progress bar; Simple
// mode keeps them monochrome — see the Settings page's "Вигляд" section
// (components/settings/view-settings.tsx). Every lesson renders only on its
// own `scheduled_date` column — an overdue lesson stays on the day it was
// due (in dark red) instead of being folded into today's column, so
// navigating to an earlier range is what surfaces it. A filter switcher
// (all lessons / not-completed only) narrows which lessons show per day.
//
// `studentId` puts this in tutor-management mode: it hits the tutor-scoped
// student calendar endpoint instead of the self-scoped "my calendar" one,
// and lessons become drag-to-reschedule/deletable instead of clickable.
// Both hooks below are always called (rules of hooks) — `enabled` picks
// which fires. `bare` drops the component's own PageContainer/title — for
// embedding inside a caller that already provides one (the tutor student
// overview page's "Календар" tab), so the page/side padding doesn't double up.
export function SimpleCalendar({
  studentId,
  colorful,
  bare,
}: { studentId?: number; colorful?: boolean; bare?: boolean } = {}) {
  const t = useTranslations("Calendar");
  const queryClient = useQueryClient();
  const isTutorView = studentId !== undefined;

  const [period, setPeriod] = useState<PeriodLength>(7);
  const [rangeStart, setRangeStart] = useState(() => defaultRangeStart(7));
  const [filter, setFilter] = useState<LessonFilter>("all");
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<CalendarItemOut | null>(null);
  const rangeDays = useMemo(
    () => Array.from({ length: period }, (_, index) => addDays(rangeStart, index)),
    [rangeStart, period],
  );
  const todayKey = useMemo(() => toLocalIsoDate(new Date()), []);

  const ownCalendarQuery = useSchedulingApiCalendar(
    { week_start: toLocalIsoDate(rangeStart) },
    { query: { enabled: !isTutorView } },
  );
  const studentCalendarQuery = useGetTutorStudentCalendar(
    studentId ?? 0,
    { week_start: toLocalIsoDate(rangeStart) },
    { query: { enabled: isTutorView } },
  );
  const calendarQuery = isTutorView ? studentCalendarQuery : ownCalendarQuery;

  const items = calendarQuery.data ?? [];
  const isLoading = calendarQuery.isLoading;
  const isError = calendarQuery.isError;

  // Same "X/Y completed this range" summary WeeklyCalendar used to show —
  // the one piece of Standard-only richness Simple lacked. Always reflects
  // every lesson in range, regardless of the display filter.
  const totalCount = items.length;
  const completedCount = items.filter((item) => item.status === "completed").length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItemOut[]>();
    for (const item of calendarQuery.data ?? []) {
      if (filter === "incomplete" && item.status === "completed") continue;
      const dayItems = map.get(item.scheduled_date) ?? [];
      dayItems.push(item);
      map.set(item.scheduled_date, dayItems);
    }
    for (const [date, dayItems] of map) {
      map.set(date, sortLessonItems(dayItems));
    }
    return map;
  }, [calendarQuery.data, filter]);

  const reschedule = useSchedulingApiReschedule();
  const deleteStudentLesson = useDeleteTutorStudentLesson();

  const invalidateCalendar = () => {
    queryClient.invalidateQueries({ queryKey: getSchedulingApiCalendarQueryKey() });
    if (studentId !== undefined) {
      queryClient.invalidateQueries({ queryKey: getGetTutorStudentCalendarQueryKey(studentId) });
    }
  };

  const handleReschedule = (item: CalendarItemOut, date: string) => {
    reschedule.mutate(
      { studentLessonId: item.id, data: { scheduled_date: date } },
      { onSuccess: () => { invalidateCalendar(); setRescheduleTarget(null); } },
    );
  };

  const handleDeleteStudentLesson = (item: CalendarItemOut) => {
    if (!window.confirm(t("removeLessonConfirm", { title: item.lesson_title }))) return;
    deleteStudentLesson.mutate({ studentLessonId: item.id }, { onSuccess: () => invalidateCalendar() });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dateKey: string) => {
    e.preventDefault();
    setDragOverDate(null);
    const draggedId = Number(e.dataTransfer.getData(DRAG_DATA_TYPE));
    if (!draggedId) return;
    const draggedItem = items.find((item) => item.id === draggedId);
    if (!draggedItem || draggedItem.status === "completed" || draggedItem.scheduled_date === dateKey) return;
    handleReschedule(draggedItem, dateKey);
  };

  const handlePeriodChange = (next: PeriodLength) => {
    if (next === period) return;
    setPeriod(next);
    setRangeStart(defaultRangeStart(next));
  };

  const content = (
    <>
      <div className="mb-4 flex flex-col items-stretch gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="flex items-center justify-center gap-2 sm:justify-start">
          <LessonFilterSwitcher filter={filter} onChange={setFilter} />
        </div>
        <div className="flex items-center justify-center gap-2 text-sm font-semibold">
          <NavButton onClick={() => setRangeStart((prev) => addDays(prev, -period))} label={t("previousWeek")}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </NavButton>
          <span>{formatDateRange(rangeDays[0], rangeDays[period - 1])}</span>
          <NavButton onClick={() => setRangeStart((prev) => addDays(prev, period))} label={t("nextWeek")}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </NavButton>
        </div>
        <div className="flex items-center justify-center gap-2 sm:justify-end">
          <PeriodSwitcher period={period} onChange={handlePeriodChange} />
          <NavButton onClick={() => setRangeStart(defaultRangeStart(period))} label={t("today")}>
            <CalendarDays className="size-4" aria-hidden="true" />
          </NavButton>
        </div>
      </div>

      {!isLoading && !isError && totalCount > 0 && (
        <div className="mb-6">
          <ProgressBar
            percent={progressPercent}
            label={t("progress", { completed: completedCount, total: totalCount })}
            colorful={colorful}
          />
        </div>
      )}

      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}
      {reschedule.isError && <p className="mb-3 text-sm text-red-600">{t("rescheduleError")}</p>}
      {deleteStudentLesson.isError && <p className="mb-3 text-sm text-red-600">{t("removeLessonError")}</p>}

      {!isLoading && !isError && (
        <div className={`grid gap-4 ${PERIOD_GRID_COLS[period]}`}>
          {rangeDays.map((day, index) => {
            const dateKey = toLocalIsoDate(day);
            const isToday = dateKey === todayKey;
            const dayItems = itemsByDate.get(dateKey) ?? [];
            const isDragOver = isTutorView && dragOverDate === dateKey;

            return (
              <div
                key={dateKey}
                className={`flex flex-col gap-2 rounded-md ${index > 0 ? "lg:border-l lg:border-gray-100 lg:pl-4" : ""} ${
                  isDragOver ? "bg-gray-100 ring-1 ring-inset ring-gray-300" : ""
                }`}
                onDragOver={
                  isTutorView
                    ? (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverDate(dateKey);
                      }
                    : undefined
                }
                onDragLeave={
                  isTutorView ? () => setDragOverDate((prev) => (prev === dateKey ? null : prev)) : undefined
                }
                onDrop={isTutorView ? (e) => handleDrop(e, dateKey) : undefined}
              >
                <div className="flex items-center justify-between gap-1.5">
                  {isToday ? (
                    <Link
                      href={isTutorView ? `/tutor/students/${studentId}` : "/"}
                      title={t("goToToday")}
                      className="text-xs font-medium capitalize text-gray-900 underline decoration-dotted underline-offset-2 hover:text-gray-600"
                    >
                      {DAY_LABEL_FORMAT.format(day)}
                    </Link>
                  ) : (
                    <div className="text-xs font-medium capitalize text-gray-400">{DAY_LABEL_FORMAT.format(day)}</div>
                  )}
                  {isTutorView && (
                    <AddDayLessonDialog studentId={studentId!} scheduledDate={dateKey} onAssigned={invalidateCalendar} />
                  )}
                </div>
                <ul className="flex flex-col gap-1">
                  {dayItems.length === 0 && <li className="text-xs text-gray-300">{t("noLessons")}</li>}
                  {dayItems.map((item) => (
                    <SimpleDayLessonRow
                      key={item.id}
                      item={item}
                      overdue={item.scheduled_date < todayKey && item.status !== "completed"}
                      readOnly={isTutorView}
                      canManage={isTutorView && item.status !== "completed"}
                      showTutorLinks={isTutorView}
                      colorful={colorful}
                      onRequestReschedule={setRescheduleTarget}
                      onRequestDelete={handleDeleteStudentLesson}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {rescheduleTarget && (
        <RescheduleDialog
          item={rescheduleTarget}
          onOpenChange={(open) => !open && setRescheduleTarget(null)}
          onSubmit={(date) => handleReschedule(rescheduleTarget, date)}
          isPending={reschedule.isPending}
          isError={reschedule.isError}
        />
      )}
    </>
  );

  if (bare) {
    return content;
  }

  return <PageContainer title={t("title")}>{content}</PageContainer>;
}
