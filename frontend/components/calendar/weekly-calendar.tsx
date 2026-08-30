"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  HelpCircle,
  PlayCircle,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
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
import type { BacklogItemOut, CalendarItemOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Link, useRouter } from "@/i18n/navigation";
import { Card } from "@/components/card";
import { StatusBadge, STATUS_LABEL_KEY } from "@/components/status-badge";
import { GradeSquareBadge } from "@/components/grade-square-badge";
import { PageContainer } from "@/components/page-container";
import { AddDayLessonDialog } from "@/components/calendar/add-day-lesson-dialog";

// dataTransfer MIME type carrying the dragged StudentLesson id between a
// LessonCard and a day column — see LessonCard's onDragStart and
// WeeklyCalendar's handleDrop below.
const DRAG_DATA_TYPE = "application/x-student-lesson-id";

const WEEK_LENGTH = 7;
const DAY_LABEL_FORMAT = new Intl.DateTimeFormat("uk-UA", { weekday: "short", day: "numeric", month: "short" });
const RANGE_DAY_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });
const RANGE_DAY_YEAR_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", year: "numeric" });

// Pastel status color, shared by StudentLessonCard's whole-card border and
// its own status icon (deliberately not StatusBadge's palette — that one's
// tuned for the tutor-facing pages and doesn't line up with this hue-per-
// status mapping: grey/green/orange/brown/red/blue).
const STATUS_PASTEL: Record<string, { border: string; iconClass: string }> = {
  assigned: { border: "#D1D5DB", iconClass: "text-gray-400" },
  in_progress: { border: "#86EFAC", iconClass: "text-green-600" },
  need_help: { border: "#FDBA74", iconClass: "text-orange-600" },
  pending_review: { border: "#D9C2A0", iconClass: "text-[#6B4423]" },
  revision_required: { border: "#FCA5A5", iconClass: "text-red-600" },
  completed: { border: "#93C5FD", iconClass: "text-blue-600" },
};

function statusPastel(status: string) {
  return STATUS_PASTEL[status] ?? STATUS_PASTEL.assigned;
}

// Icon shown in StudentLessonCard's footer in place of a text StatusBadge.
const STATUS_ICON: Record<string, LucideIcon> = {
  assigned: Circle,
  in_progress: PlayCircle,
  need_help: HelpCircle,
  pending_review: Clock,
  revision_required: RotateCcw,
  completed: CheckCircle2,
};

// Splits a day's lessons into "needs the student's attention now" (top) vs
// "waiting on someone else / done" (bottom) — see the <hr> between them in
// each day column below.
const ACTIVE_STATUSES = new Set(["assigned", "in_progress", "revision_required"]);

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

// Single lesson card shared by the student's own /calendar and the tutor's
// view of a student's calendar (/tutor/students/{id}/calendar) — same
// pastel-status layout in both places: subject name up top, the lesson
// title clamped to 2 lines below it, then a footer row with the status icon
// on the left and — only when a grade exists — a small grade badge on the
// right. The whole card's pastel border color encodes the lesson's status
// too, echoed by the footer's status icon's color.
//
// href is omitted (readOnly) for a tutor viewing a student's calendar —
// /lessons/{id} is the student wizard, not a page a tutor can open.
// `canManage` (tutor view, not-completed lesson) turns the card into a drag
// source and adds the "change date" header button — see WeeklyCalendar's
// handleDrop/rescheduleTarget. `showTutorLinks` (tutor viewing a student's
// calendar) adds the "preview as student" and "subject details" header
// icons regardless of lesson status, and swaps the footer's "view subject"
// link (which points at the student-facing /subjects/{id} page) out in
// favor of that header's subject-details link.
function LessonCard({
  item,
  readOnly,
  canManage,
  showTutorLinks,
  onRequestReschedule,
  onRequestDelete,
}: {
  item: CalendarItemOut;
  readOnly?: boolean;
  canManage?: boolean;
  showTutorLinks?: boolean;
  onRequestReschedule?: (item: CalendarItemOut) => void;
  onRequestDelete?: (item: CalendarItemOut) => void;
}) {
  const t = useTranslations("Calendar");
  const tStatus = useTranslations("LessonStatus");
  const router = useRouter();
  const pastel = statusPastel(item.status);
  const StatusIcon = STATUS_ICON[item.status] ?? Circle;
  const statusLabel = tStatus(STATUS_LABEL_KEY[item.status] ?? "statusAssigned");
  const showStudentSubjectLink = !showTutorLinks;
  const showHeaderRow = showTutorLinks || canManage;

  // Keeps a click/tap on one of the header icon links from being swallowed
  // by the card's own native HTML5 drag (draggable="true" on the parent).
  const stopDragStart = (e: React.MouseEvent) => e.stopPropagation();

  const iconButtonClasses = "rounded px-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700";

  return (
    <Card
      href={readOnly ? undefined : `/lessons/${item.id}`}
      className={`flex flex-col gap-1 border-l-4 ${canManage ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{ borderLeftColor: item.subject_color ?? "#D1D5DB" }}
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
      {showHeaderRow && (
        <div className="flex items-center justify-end gap-1">
          {showTutorLinks && (
            <>
              <Link
                href={`/tutor/lessons/${item.lesson_id}`}
                onMouseDown={stopDragStart}
                title={t("previewAsStudent")}
                aria-label={t("previewAsStudent")}
                className={iconButtonClasses}
              >
                <Eye className="h-4 w-4" />
              </Link>
              <Link
                href={`/tutor/subjects/${item.subject_id}`}
                onMouseDown={stopDragStart}
                title={t("openSubject")}
                aria-label={t("openSubject")}
                className={iconButtonClasses}
              >
                <BookOpen className="h-4 w-4" />
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
              title={t("changeDate")}
              aria-label={t("changeDate")}
              className={`shrink-0 ${iconButtonClasses}`}
            >
              <CalendarClock className="h-4 w-4" />
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
              title={t("removeLesson")}
              aria-label={t("removeLesson")}
              className="shrink-0 rounded px-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <p className="truncate text-base font-semibold text-gray-900">{item.subject_name}</p>
      <p
        className="line-clamp-2 text-xs text-gray-500"
        title={t("lessonTooltip", { topic: item.topic_title, lesson: item.lesson_title })}
      >
        {item.lesson_title}
      </p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span role="img" aria-label={statusLabel} title={statusLabel} className="shrink-0">
            <StatusIcon aria-hidden="true" className={`h-4 w-4 ${pastel.iconClass}`} />
          </span>
          {showStudentSubjectLink && (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/subjects/${item.subject_id}`);
              }}
              title={t("viewSubject")}
              aria-label={t("viewSubject")}
              className="shrink-0 rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <BookOpen className="h-4 w-4" />
            </button>
          )}
        </div>
        <GradeSquareBadge
          gradePoints={item.grade_points}
          gradeResult={item.grade_result}
          sizeClassName="h-6 w-6"
          compact
        />
      </div>
    </Card>
  );
}

// Popup opened by LessonCard's "change date" button — lets the tutor pick
// any date (not just a drag-and-drop target within the visible week).
function RescheduleDialog({
  item,
  onOpenChange,
  onSubmit,
  isPending,
  isError,
}: {
  item: CalendarItemOut;
  onOpenChange: (open: boolean) => void;
  onSubmit: (date: string) => void;
  isPending: boolean;
  isError: boolean;
}) {
  const t = useTranslations("Calendar");
  const [date, setDate] = useState(item.scheduled_date);

  return (
    <Dialog.Root open onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">{t("rescheduleTitle")}</Dialog.Title>
          <p className="mt-1 truncate text-sm text-gray-500">{item.lesson_title}</p>

          <div className="mt-4 flex flex-col gap-1">
            <label htmlFor="reschedule-date" className="text-xs font-medium text-gray-700">
              {t("rescheduleDateLabel")}
            </label>
            <input
              id="reschedule-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
            />
          </div>

          {isError && <p className="mt-2 text-sm text-red-600">{t("rescheduleError")}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("rescheduleCancel")}
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={!date || isPending}
              onClick={() => onSubmit(date)}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {t("rescheduleSubmit")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function BacklogCard({ item, readOnly }: { item: BacklogItemOut; readOnly?: boolean }) {
  const t = useTranslations("Calendar");

  return (
    <Card href={readOnly ? undefined : `/lessons/${item.id}`} className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.lesson_title}</p>
        <p className="truncate text-xs text-gray-500">{item.subject_name}</p>
        <p className="truncate text-xs text-amber-700">
          {t("backlogOrigin", { label: RANGE_DAY_FORMAT.format(new Date(`${item.origin_label}T00:00:00`)) })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <GradeSquareBadge gradePoints={item.grade_points} gradeResult={item.grade_result} />
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

// `studentId` puts this in read-only "tutor viewing a student" mode: it
// hits the tutor-scoped student calendar/backlog endpoints instead of the
// self-scoped "my calendar" ones, and lesson cards aren't clickable (see
// LessonCard/BacklogCard above). Both hook pairs are always called (rules
// of hooks) — `enabled` picks which one actually fires.
export function WeeklyCalendar({ studentId }: { studentId?: number } = {}) {
  const t = useTranslations("Calendar");
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<CalendarItemOut | null>(null);
  const isTutorView = studentId !== undefined;

  const weekDays = useMemo(
    () => Array.from({ length: WEEK_LENGTH }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );
  const todayKey = useMemo(() => toLocalIsoDate(new Date()), []);

  const ownCalendarQuery = useSchedulingApiCalendar(
    { week_start: toLocalIsoDate(weekStart) },
    { query: { enabled: !isTutorView } },
  );
  const studentCalendarQuery = useGetTutorStudentCalendar(
    studentId ?? 0,
    { week_start: toLocalIsoDate(weekStart) },
    { query: { enabled: isTutorView } },
  );
  const calendarQuery = isTutorView ? studentCalendarQuery : ownCalendarQuery;

  const ownBacklogQuery = useSchedulingApiBacklog({ query: { enabled: !isTutorView } });
  const studentBacklogQuery = useGetTutorStudentBacklog(studentId ?? 0, { query: { enabled: isTutorView } });
  const backlogQuery = isTutorView ? studentBacklogQuery : ownBacklogQuery;

  const items = calendarQuery.data ?? [];
  const backlog = backlogQuery.data ?? [];

  // Days sorted alphabetically by subject name (uk collation) so a
  // student's lesson order within a day doesn't depend on scheduling order.
  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItemOut[]>();
    for (const item of calendarQuery.data ?? []) {
      const dayItems = map.get(item.scheduled_date) ?? [];
      dayItems.push(item);
      map.set(item.scheduled_date, dayItems);
    }
    for (const dayItems of map.values()) {
      dayItems.sort((a, b) => a.subject_name.localeCompare(b.subject_name, "uk"));
    }
    return map;
  }, [calendarQuery.data]);

  const totalCount = items.length;
  const completedCount = items.filter((item) => item.status === "completed").length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

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
      {
        onSuccess: () => {
          invalidateCalendar();
          setRescheduleTarget(null);
        },
      },
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

  return (
    <PageContainer title={t("title")}>
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
      {reschedule.isError && <p className="mb-3 text-sm text-red-600">{t("rescheduleError")}</p>}
      {deleteStudentLesson.isError && <p className="mb-3 text-sm text-red-600">{t("removeLessonError")}</p>}

      {!calendarQuery.isLoading && !calendarQuery.isError && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          {weekDays.map((day, index) => {
            const dateKey = toLocalIsoDate(day);
            const dayItems = itemsByDate.get(dateKey) ?? [];
            const isToday = dateKey === todayKey;
            const isDragOver = isTutorView && dragOverDate === dateKey;
            const columnClasses = [
              "flex flex-col gap-2 rounded-md lg:px-3 lg:py-2",
              index > 0 && "lg:border-l lg:border-gray-200",
              isToday && "bg-blue-50/60",
              isDragOver && "bg-blue-100 ring-2 ring-inset ring-blue-400",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div
                key={dateKey}
                className={columnClasses}
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
                <div className="flex items-center gap-1">
                  <div
                    className={`inline-block w-fit rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      isToday ? "bg-blue-600 text-white" : "text-gray-500"
                    }`}
                  >
                    {DAY_LABEL_FORMAT.format(day)}
                  </div>
                  {isTutorView && (
                    <AddDayLessonDialog
                      studentId={studentId!}
                      scheduledDate={dateKey}
                      onAssigned={invalidateCalendar}
                    />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {dayItems.length === 0 && <p className="text-xs text-gray-400">{t("noLessons")}</p>}
                  {(() => {
                    const activeItems = dayItems.filter((item) => ACTIVE_STATUSES.has(item.status));
                    const otherItems = dayItems.filter((item) => !ACTIVE_STATUSES.has(item.status));
                    const renderCard = (item: CalendarItemOut) => (
                      <LessonCard
                        key={item.id}
                        item={item}
                        readOnly={isTutorView}
                        canManage={isTutorView && item.status !== "completed"}
                        showTutorLinks={isTutorView}
                        onRequestReschedule={setRescheduleTarget}
                        onRequestDelete={handleDeleteStudentLesson}
                      />
                    );
                    return (
                      <>
                        {activeItems.map(renderCard)}
                        {activeItems.length > 0 && otherItems.length > 0 && (
                          <hr className="border-gray-200" />
                        )}
                        {otherItems.map(renderCard)}
                      </>
                    );
                  })()}
                </div>
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

      {!backlogQuery.isLoading && !backlogQuery.isError && backlog.length > 0 && (
        <div className="mt-8 flex flex-col gap-2">
          <h3 className="text-lg font-semibold">{t("backlogTitle")}</h3>
          <p className="-mt-1 mb-1 text-sm text-gray-500">{t("backlogHint")}</p>
          <ul className="flex flex-col gap-2">
            {backlog.map((item) => (
              <li key={item.id}>
                <BacklogCard item={item} readOnly={isTutorView} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageContainer>
  );
}
