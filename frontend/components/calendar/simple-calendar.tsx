"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Eye, Trash2, CalendarClock, Monitor } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  getGetTutorStudentCalendarQueryKey,
  getSchedulingApiCalendarQueryKey,
  useGetTutorStudentBacklog,
  useGetTutorStudentCalendar,
  useSchedulingApiBacklog,
  useSchedulingApiCalendar,
  useSchedulingApiReschedule,
} from "@/lib/api/browser/schedule/schedule";
import { useDeleteTutorStudentLesson } from "@/lib/api/browser/tutor/tutor";
import { PageContainer } from "@/components/page-container";
import { ProgressBar } from "@/components/progress-bar";
import { AddDayLessonDialog } from "@/components/calendar/add-day-lesson-dialog";
import { RescheduleDialog } from "@/components/calendar/reschedule-dialog";
import { sortLessonItems } from "@/lib/lesson-order";
import { LESSON_TYPE_ICON, LESSON_TYPE_ICON_COLOR } from "@/components/simple/lesson-type-icon";
import { formatGradeLabel, formatShortDate, resolveStatusLabel } from "@/components/simple/format";
import { StatusBadge } from "@/components/status-badge";
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

const iconButtonClasses = "rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700";

// One lesson entry inside a day column — monochrome, tiny grey icon, subject
// and lesson title on their own lines, then status/grade/backlog-origin as
// small grey meta text below. In tutor-management mode (`canManage`/
// `showTutorLinks`, set only when SimpleCalendar is given a `studentId`)
// the row also gets a trailing action line mirroring WeeklyCalendar's
// LessonCard: drag-to-reschedule, a "change date" button, "preview as
// student"/"open subject" links, and a delete button for still-unstarted
// assignments — same capabilities, monochrome styling.
function SimpleDayLessonRow({
  item,
  originLabel,
  readOnly,
  canManage,
  showTutorLinks,
  colorful,
  onRequestReschedule,
  onRequestDelete,
}: {
  item: CalendarItemOut;
  originLabel?: string;
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

  const gradeLabel = formatGradeLabel({
    gradePoints: item.grade_points,
    gradeResult: item.grade_result,
    t,
    bare: true,
  });

  // Status moves out of the plain-text meta line into a small colored
  // badge in colorful mode — same convention as the dashboard table.
  const statusLabel = colorful ? null : resolveStatusLabel(item.status, tStatus);
  const metaParts = [originLabel ?? null, statusLabel, gradeLabel].filter(Boolean);
  const showActionRow = showTutorLinks || canManage;

  const stopDragStart = (e: React.MouseEvent) => e.stopPropagation();

  const content = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon className={`size-3.5 shrink-0 ${iconColorClass}`} aria-hidden="true" />
        <span className="truncate text-xs font-medium text-gray-900">{item.subject_name}</span>
      </span>
      <span className="truncate pl-5 text-xs text-gray-600">{item.lesson_title}</span>
      <span className="flex items-center gap-1.5 pl-5">
        {metaParts.length > 0 && (
          <span className="truncate text-[11px] text-gray-400">{metaParts.join(" · ")}</span>
        )}
        {colorful && <StatusBadge status={item.status} small />}
      </span>
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

  const rowClassName = `flex flex-col gap-0.5 rounded px-1.5 py-1 hover:bg-gray-50 ${
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
// (components/settings/view-settings.tsx). The backlog ("хвости") isn't a
// separate section — it's folded directly into today's column, since a
// tail is exactly a lesson that should have happened by today.
//
// `studentId` puts this in tutor-management mode: it hits the tutor-scoped
// student calendar/backlog endpoints instead of the self-scoped "my
// calendar" ones, and lessons become drag-to-reschedule/deletable instead
// of clickable. Both hook pairs below are always called (rules of hooks) —
// `enabled` picks which fires.
export function SimpleCalendar({ studentId, colorful }: { studentId?: number; colorful?: boolean } = {}) {
  const t = useTranslations("Calendar");
  const queryClient = useQueryClient();
  const isTutorView = studentId !== undefined;

  const [period, setPeriod] = useState<PeriodLength>(7);
  const [rangeStart, setRangeStart] = useState(() => defaultRangeStart(7));
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

  const ownBacklogQuery = useSchedulingApiBacklog({ query: { enabled: !isTutorView } });
  const studentBacklogQuery = useGetTutorStudentBacklog(studentId ?? 0, { query: { enabled: isTutorView } });
  const backlogQuery = isTutorView ? studentBacklogQuery : ownBacklogQuery;

  const items = calendarQuery.data ?? [];
  const isLoading = calendarQuery.isLoading || backlogQuery.isLoading;
  const isError = calendarQuery.isError || backlogQuery.isError;

  // Same "X/Y completed this range" summary WeeklyCalendar used to show —
  // the one piece of Standard-only richness Simple lacked.
  const totalCount = items.length;
  const completedCount = items.filter((item) => item.status === "completed").length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

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
            // Tails are folded into today's column instead of a separate
            // backlog section — they only ever appear on the one column
            // that's actually "today" (navigating away from today simply
            // shows no tails, since there's no "today" column to fold them
            // into there).
            const backlogItems = isToday ? sortedBacklog : [];

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
                  <div className={`text-xs font-medium capitalize ${isToday ? "text-gray-900" : "text-gray-400"}`}>
                    {DAY_LABEL_FORMAT.format(day)}
                  </div>
                  {isTutorView && (
                    <AddDayLessonDialog studentId={studentId!} scheduledDate={dateKey} onAssigned={invalidateCalendar} />
                  )}
                </div>
                <ul className="flex flex-col gap-1">
                  {dayItems.length === 0 && backlogItems.length === 0 && (
                    <li className="text-xs text-gray-300">{t("noLessons")}</li>
                  )}
                  {dayItems.map((item) => (
                    <SimpleDayLessonRow
                      key={item.id}
                      item={item}
                      readOnly={isTutorView}
                      canManage={isTutorView && item.status !== "completed"}
                      showTutorLinks={isTutorView}
                      colorful={colorful}
                      onRequestReschedule={setRescheduleTarget}
                      onRequestDelete={handleDeleteStudentLesson}
                    />
                  ))}
                  {backlogItems.map((item) => (
                    <SimpleDayLessonRow
                      key={item.id}
                      item={item}
                      readOnly={isTutorView}
                      colorful={colorful}
                      originLabel={formatShortDate(item.origin_label)}
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
    </PageContainer>
  );
}
