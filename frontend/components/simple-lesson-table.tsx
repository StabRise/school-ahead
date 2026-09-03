"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpDown, ChevronDown, ChevronUp, FileText, ListChecks, Monitor, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { compareLessonItems } from "@/lib/lesson-order";
import { STATUS_LABEL_KEY } from "@/components/status-badge";
import type { BacklogItemOut, CalendarItemOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

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

const LESSON_TYPE_ICON: Record<string, LucideIcon> = {
  theory: Monitor,
  with_task: FileText,
  with_quiz: ListChecks,
};

// Shared by the header row and every body row so columns line up like a
// real table: icon / subject+lesson (flexible) / date / grade / status.
const ROW_GRID = "grid grid-cols-[1.25rem_minmax(0,1fr)_5.5rem_3.5rem_7rem] items-center gap-3";

const DATE_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });

// origin_label (backlog rows only) is the lesson's original scheduled day —
// same field the Standard dashboard/calendar already format as their
// "tail" date label. Both it and scheduled_date are plain ISO dates, so
// plain string comparison sorts them correctly.
function rowDate(row: SimpleRow): string {
  return row.origin_label ?? row.scheduled_date;
}

function formatRowDate(row: SimpleRow): string {
  return DATE_FORMAT.format(new Date(`${rowDate(row)}T00:00:00`));
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

function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-left text-xs font-medium text-gray-500 hover:text-gray-700"
    >
      {label}
      {active ? (
        direction === "asc" ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        )
      ) : (
        <ArrowUpDown className="size-3 text-gray-300" />
      )}
    </button>
  );
}

function SimpleRowItem({ item }: { item: SimpleRow }) {
  const t = useTranslations("LessonWizard");
  const tStatus = useTranslations("LessonStatus");
  const Icon = LESSON_TYPE_ICON[item.lesson_type] ?? Monitor;

  const gradeLabel =
    item.grade_result === "pass"
      ? t("scorePass")
      : item.grade_result === "fail"
        ? t("scoreFail")
        : item.grade_points !== null
          ? t("scoreValue", { points: item.grade_points })
          : null;

  return (
    <li>
      <Link href={`/lessons/${item.id}`} className={`${ROW_GRID} px-2 py-2 hover:bg-gray-50`}>
        <Icon className="size-4 text-gray-400" aria-hidden="true" />
        <span className="min-w-0 truncate">
          <span className="font-medium text-gray-900">{item.subject_name}</span>
          <span className="text-gray-400">: </span>
          <span className="text-gray-600">{item.lesson_title}</span>
        </span>
        <span className="text-xs text-gray-500">{formatRowDate(item)}</span>
        <span className={`text-xs ${gradeLabel ? "text-gray-500" : "text-gray-300"}`}>{gradeLabel ?? "—"}</span>
        <span className="truncate text-xs text-gray-500">
          {tStatus(STATUS_LABEL_KEY[item.status] ?? STATUS_LABEL_KEY.assigned)}
        </span>
      </Link>
    </li>
  );
}

// Notion-style, monochrome (no colored badges, no card borders) sortable
// table — the "Simple" view's shared building block, used by both
// components/simple-dashboard.tsx and components/calendar/simple-calendar.tsx
// (see the Settings page's "Вигляд" section for how a student picks it).
export function SimpleLessonTable({ rows, emptyMessage }: { rows: SimpleRow[]; emptyMessage: string }) {
  const t = useTranslations("SimpleLessonTable");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "date", direction: "asc" });

  const sortedRows = [...rows].sort((a, b) => compareRows(a, b, sort.key, sort.direction));

  const handleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" },
    );
  };

  if (sortedRows.length === 0) {
    return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className={`${ROW_GRID} min-w-[36rem] px-2 pb-2`}>
        <span aria-hidden="true" />
        <SortableHeader
          label={t("columnLesson")}
          active={sort.key === "subject"}
          direction={sort.direction}
          onClick={() => handleSort("subject")}
        />
        <SortableHeader
          label={t("columnDate")}
          active={sort.key === "date"}
          direction={sort.direction}
          onClick={() => handleSort("date")}
        />
        <SortableHeader
          label={t("columnGrade")}
          active={sort.key === "grade"}
          direction={sort.direction}
          onClick={() => handleSort("grade")}
        />
        <SortableHeader
          label={t("columnStatus")}
          active={sort.key === "status"}
          direction={sort.direction}
          onClick={() => handleSort("status")}
        />
      </div>
      <ul className="min-w-[36rem] divide-y divide-gray-100">
        {sortedRows.map((item) => (
          <SimpleRowItem key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}
