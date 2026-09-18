"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CircleCheck, Monitor } from "lucide-react";
import { compareLessonItems } from "@/lib/lesson-order";
import { LESSON_TYPE_ICON, LESSON_TYPE_ICON_COLOR } from "@/components/simple/lesson-type-icon";
import { formatGradeLabel, formatShortDate, resolveStatusLabel } from "@/components/simple/format";
import { SortableHeader, useSortState } from "@/components/simple/sortable-header";
import { StatusBadge } from "@/components/status-badge";
import type { BacklogItemOut, CalendarItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

// Local (not UTC) YYYY-MM-DD — same rule as this table's other Simple-view
// siblings' identical helper, used only to flag an overdue row in
// `colorful` mode.
function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// A today/week lesson or a backlog ("tail") lesson merged into one row —
// every CalendarItemOut field plus the backlog-only origin_label, so both
// BacklogItemOut and CalendarItemOut values fit this shape with no
// per-item mapping. Shared by the Simple dashboard
// (components/simple-dashboard.tsx) and Simple calendar
// (components/calendar/simple-calendar.tsx) views.
export type SimpleRow = CalendarItemOut & { origin_label?: string };

// Deduped by id (Map, backlog last so it wins on collision, carrying
// origin_label) — a backlog item can also fall inside a queried date range
// (e.g. the calendar's Simple view showing a past week that includes an
// overdue, still-incomplete lesson), which would otherwise show the exact
// same lesson twice in one flat table.
export function mergeSimpleRows(lessons: CalendarItemOut[], backlog: BacklogItemOut[]): SimpleRow[] {
  const byId = new Map<number, SimpleRow>();
  for (const item of lessons) byId.set(item.id, item);
  for (const item of backlog) byId.set(item.id, item);
  return [...byId.values()];
}

// Shared by the header row and every body row so columns line up like a
// real table: icon / subject+lesson (flexible) / date / grade / status /
// [assigned by] / action. The trailing action column is always reserved
// (even when no `onMarkComplete` is passed, e.g. the student's own
// dashboard) so the other columns stay aligned between a plain and an
// actionable table. The "assigned by" column (`showAssignedBy`) is only
// ever added by the tutor's student-overview page, and only for a student
// with can_do_any_lesson set — see SimpleLessonTable's own doc comment.
function rowGrid(showAssignedBy?: boolean): string {
  // Two complete, unbroken class strings — not one template literal with
  // the column list spliced together at runtime. Tailwind's build-time
  // scanner only picks up class names that appear literally intact in the
  // source text; splitting this arbitrary-value class with `${}` meant
  // neither variant's `grid-cols-[...]` was ever generated, so every row
  // silently fell back to a single implicit column (everything stacked).
  return showAssignedBy
    ? "grid grid-cols-[1.25rem_minmax(0,1fr)_5.5rem_3.5rem_10rem_7rem_1.75rem] items-center gap-3"
    : "grid grid-cols-[1.25rem_minmax(0,1fr)_5.5rem_3.5rem_10rem_1.75rem] items-center gap-3";
}

// origin_label (backlog rows only) is the lesson's original scheduled day —
// same field the Standard dashboard/calendar already format as their
// "tail" date label. Both it and scheduled_date are plain ISO dates, so
// plain string comparison sorts them correctly.
function rowDate(row: SimpleRow): string {
  return row.origin_label ?? row.scheduled_date;
}

// A fixed priority rank (not a translated-label sort, which would need a
// hook inside this plain comparator) — matches STATUS_LABEL_KEY's own key
// order in components/status-badge.tsx.
const STATUS_SORT_RANK: Record<string, number> = {
  assigned: 0,
  in_progress: 1,
  need_help: 2,
  pending_review: 3,
  revision_required: 4,
  completed: 5,
};

// pass/fail carry no numeric points, so they're pinned to the top/bottom of
// the graded scale; a row with neither points nor a pass/fail result is
// "ungraded" (NaN) and always sorts last, independent of direction — see
// compareRows.
function gradeSortValue(row: SimpleRow): number {
  if (row.grade_result === "pass") return Number.POSITIVE_INFINITY;
  if (row.grade_result === "fail") return Number.NEGATIVE_INFINITY;
  if (row.grade_points !== null) return row.grade_points;
  return Number.NaN;
}

type SortKey = "date" | "subject" | "grade" | "status";
type SortDirection = "asc" | "desc";

// Takes `direction` itself (rather than sorting once and reversing) so the
// grade column's "ungraded always last" rule survives a descending sort
// instead of being flipped to "ungraded always first" by a blanket reverse.
function compareRows(a: SimpleRow, b: SimpleRow, key: SortKey, direction: SortDirection): number {
  const sign = direction === "asc" ? 1 : -1;
  switch (key) {
    case "date":
      return sign * rowDate(a).localeCompare(rowDate(b));
    case "subject":
      return sign * compareLessonItems(a, b);
    case "status":
      return sign * ((STATUS_SORT_RANK[a.status] ?? 0) - (STATUS_SORT_RANK[b.status] ?? 0));
    case "grade": {
      const aValue = gradeSortValue(a);
      const bValue = gradeSortValue(b);
      const aUngraded = Number.isNaN(aValue);
      const bUngraded = Number.isNaN(bValue);
      if (aUngraded || bUngraded) {
        if (aUngraded === bUngraded) return 0;
        return aUngraded ? 1 : -1;
      }
      return sign * (aValue - bValue);
    }
  }
}

function SimpleRowItem({
  item,
  colorful,
  hrefFor,
  onMarkComplete,
  markingCompleteId,
  showAssignedBy,
}: {
  item: SimpleRow;
  colorful?: boolean;
  hrefFor: (item: SimpleRow) => string;
  // Tutor-only "mark as done" action (see SimpleLessonTable's own doc
  // comment) — undefined for the student's own dashboard, so no button
  // renders there and this row stays a plain link.
  onMarkComplete?: (item: SimpleRow) => void;
  markingCompleteId?: number;
  showAssignedBy?: boolean;
}) {
  const t = useTranslations("LessonWizard");
  const tStatus = useTranslations("LessonStatus");
  const tTable = useTranslations("SimpleLessonTable");
  const Icon = LESSON_TYPE_ICON[item.lesson_type] ?? Monitor;

  const gradeLabel = formatGradeLabel({
    gradePoints: item.grade_points,
    gradeResult: item.grade_result,
    t,
    bare: false,
  });

  // "не виконано вчасно" — overdue and not done yet — gets a dark red date
  // in colorful mode (the Default dashboard); Simple mode never flags this.
  const isOverdue = colorful && rowDate(item) < toLocalIsoDate(new Date()) && item.status !== "completed";

  return (
    <li>
      <Link href={hrefFor(item)} className={`${rowGrid(showAssignedBy)} px-2 py-2 hover:bg-gray-50`}>
        <Icon
          className={`size-4 ${colorful ? (LESSON_TYPE_ICON_COLOR[item.lesson_type] ?? "text-gray-400") : "text-gray-400"}`}
          aria-hidden="true"
        />
        <span className="min-w-0 truncate">
          <span className="font-medium text-gray-900">{item.subject_name}</span>
          <span className="text-gray-400">: </span>
          <span className="text-gray-600">{item.lesson_title}</span>
        </span>
        <span className={`text-xs ${isOverdue ? "font-semibold text-red-800" : "text-gray-500"}`}>
          {formatShortDate(rowDate(item))}
        </span>
        <span className={`text-xs ${gradeLabel ? "text-gray-500" : "text-gray-300"}`}>{gradeLabel ?? "—"}</span>
        {colorful ? (
          <div className="flex justify-center">
            <StatusBadge status={item.status} small />
          </div>
        ) : (
          <span className="truncate text-xs text-gray-500">{resolveStatusLabel(item.status, tStatus)}</span>
        )}
        {showAssignedBy && (
          <span className="truncate text-xs text-gray-500">
            {item.is_self_selected ? tTable("assignedByStudent") : tTable("assignedByTutor")}
          </span>
        )}
        {onMarkComplete && item.status !== "completed" && (
          // Plain <button> (not a nested <a>) — this row is already a Link,
          // and stopping propagation/preventing default here is what keeps
          // the click from also navigating to the lesson, same convention
          // as tutor-stories-page.tsx's DownloadStoryButton.
          <button
            type="button"
            title={tTable("markCompleteLabel")}
            aria-label={tTable("markCompleteLabel")}
            disabled={markingCompleteId === item.id}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMarkComplete(item);
            }}
            className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
          >
            <CircleCheck className="h-4 w-4" />
          </button>
        )}
      </Link>
    </li>
  );
}

// Notion-style, borderless sortable table — the "Simple" view's shared
// building block, used by components/simple-dashboard.tsx (see the Settings
// page's "Вигляд" section for how a student picks it) and, via a
// tutor-scoped `hrefFor` plus `onMarkComplete`, by the tutor's
// student-overview page (which can additionally mark a lesson done).
// `colorful` keeps the same dense table shape but restores the Default
// dashboard's colored status badges and dark-red overdue dates instead of
// Simple's plain grey text.
export function SimpleLessonTable({
  rows,
  emptyMessage,
  colorful,
  hrefFor = (item) => `/lessons/${item.id}`,
  onMarkComplete,
  markingCompleteId,
  showAssignedBy,
}: {
  rows: SimpleRow[];
  emptyMessage: string;
  colorful?: boolean;
  // Every row's own StudentLesson page by default — the student's own
  // dashboard/calendar. A tutor viewing another student's table passes
  // their own read-only lesson route instead (see
  // tutor-student-overview-page.tsx), since /lessons/[id] only works for
  // the signed-in student themself.
  hrefFor?: (item: SimpleRow) => string;
  // Tutor-only "mark as done" action, rendered as a small per-row button —
  // omitted entirely (no button, plain row) for the student's own
  // dashboard, which passes neither of these.
  onMarkComplete?: (item: SimpleRow) => void;
  // The row currently mid-mutation, so only its own button disables/spins
  // rather than the whole table.
  markingCompleteId?: number;
  // Adds a "Учень/Тьютор" column (item.is_self_selected) — only passed by
  // the tutor's student-overview page, and only for a student with
  // StudentProfile.can_do_any_lesson set (otherwise every row would always
  // read "Тьютор", telling the tutor nothing).
  showAssignedBy?: boolean;
}) {
  const t = useTranslations("SimpleLessonTable");
  const { sort, toggleSort } = useSortState<SortKey>("date");

  const sortedRows = [...rows].sort((a, b) => compareRows(a, b, sort.key, sort.direction));

  if (sortedRows.length === 0) {
    return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className={`${rowGrid(showAssignedBy)} min-w-[39rem] px-2 pb-2`}>
        <span aria-hidden="true" />
        <SortableHeader
          label={t("columnLesson")}
          active={sort.key === "subject"}
          direction={sort.direction}
          onClick={() => toggleSort("subject")}
        />
        <SortableHeader
          label={t("columnDate")}
          active={sort.key === "date"}
          direction={sort.direction}
          onClick={() => toggleSort("date")}
        />
        <SortableHeader
          label={t("columnGrade")}
          active={sort.key === "grade"}
          direction={sort.direction}
          onClick={() => toggleSort("grade")}
        />
        <SortableHeader
          label={t("columnStatus")}
          active={sort.key === "status"}
          direction={sort.direction}
          onClick={() => toggleSort("status")}
        />
        {showAssignedBy && (
          <span className="text-xs font-medium text-gray-500">{t("columnAssignedBy")}</span>
        )}
        <span aria-hidden="true" />
      </div>
      <ul className="min-w-[39rem] divide-y divide-gray-100">
        {sortedRows.map((item) => (
          <SimpleRowItem
            key={item.id}
            item={item}
            showAssignedBy={showAssignedBy}
            colorful={colorful}
            hrefFor={hrefFor}
            onMarkComplete={onMarkComplete}
            markingCompleteId={markingCompleteId}
          />
        ))}
      </ul>
    </div>
  );
}
