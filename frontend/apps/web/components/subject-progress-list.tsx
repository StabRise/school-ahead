"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowUpDown, BookOpen, Check, Group, Ungroup } from "lucide-react";
import { useListMyAchievements } from "@school-ahead/api-client/browser/achievements/achievements";
import { useListTutorStudentAchievements } from "@school-ahead/api-client/browser/tutor/tutor";
import type { SubjectAchievementOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Link } from "@/i18n/navigation";
import { ProgressBar } from "@/components/progress-bar";
import { useSubjectProgressViewStore, type SubjectProgressSort } from "@/stores/subject-progress-view-store";

const SORT_OPTIONS: SubjectProgressSort[] = ["default", "name", "progress_asc", "progress_desc"];

// Not a real SubjectGroup id — buckets every subject with group_id === null
// under one always-present "Без групи" section in the grouped view. Same
// convention as components/subjects/simple-subjects-page.tsx.
const UNGROUPED_KEY = "ungrouped";

function sortSubjects(subjects: SubjectAchievementOut[], sort: SubjectProgressSort): SubjectAchievementOut[] {
  const sorted = [...subjects];
  switch (sort) {
    case "name":
      sorted.sort((a, b) => a.subject_name.localeCompare(b.subject_name, "uk"));
      break;
    case "progress_asc":
      sorted.sort((a, b) => a.completed_percent - b.completed_percent);
      break;
    case "progress_desc":
      sorted.sort((a, b) => b.completed_percent - a.completed_percent);
      break;
    default:
      sorted.sort((a, b) => a.order_index - b.order_index || a.subject_name.localeCompare(b.subject_name, "uk"));
  }
  return sorted;
}

interface SubjectGroupBucket {
  key: string;
  label: string;
  order: number;
  items: SubjectAchievementOut[];
}

// Buckets an already-sorted list by group, preserving each subject's
// relative order within its bucket — real groups first (by
// group_order_index, then name), the "Без групи" bucket always last.
function groupSubjects(subjects: SubjectAchievementOut[], ungroupedLabel: string): SubjectGroupBucket[] {
  const buckets = new Map<string, SubjectGroupBucket>();
  for (const subject of subjects) {
    const key = subject.group_id !== null ? String(subject.group_id) : UNGROUPED_KEY;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: subject.group_id !== null ? (subject.group_name ?? "") : ungroupedLabel,
        order: subject.group_id !== null ? subject.group_order_index : Number.MAX_SAFE_INTEGER,
        items: [],
      };
      buckets.set(key, bucket);
    }
    bucket.items.push(subject);
  }
  return [...buckets.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "uk"));
}

function SubjectProgressRow({
  subject,
  colorful,
  href,
  extraHref,
  extraLabel,
}: {
  subject: SubjectAchievementOut;
  colorful?: boolean;
  href: string;
  extraHref?: string;
  extraLabel?: string;
}) {
  return (
    <li>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-gray-500">
        <Link href={href} className="min-w-0 truncate text-gray-700 hover:underline">
          {subject.subject_name}
        </Link>
        <span className="flex shrink-0 items-center gap-2">
          {extraHref && (
            <Link
              href={extraHref}
              title={extraLabel}
              aria-label={extraLabel}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
          <span>{Math.round(subject.completed_percent)}%</span>
        </span>
      </div>
      <ProgressBar percent={subject.completed_percent} colorful={colorful} />
    </li>
  );
}

// The one "Прогрес по предметах" list for every context it appears in —
// the student's own dashboard (components/simple-dashboard.tsx) and the
// tutor's per-student stats tab (components/tutor/tutor-student-overview-
// page.tsx). `studentId` puts it in tutor-viewing mode: it hits the tutor-
// scoped achievements endpoint instead of the self-scoped one, and each row
// gets an extra "open subject" link the self view doesn't need. Both hooks
// below are always called (rules of hooks) — `enabled` picks which fires,
// same pattern as SimpleCalendar.
//
// View (grouped by SubjectGroup / flat) and sort (curriculum order / name /
// progress asc / progress desc) are display-only preferences, persisted
// client-side via useSubjectProgressViewStore — shared across every place
// this component renders, not per-student.
export function SubjectProgressList({ studentId, colorful }: { studentId?: number; colorful?: boolean } = {}) {
  const t = useTranslations("SubjectProgress");
  const isTutorView = studentId !== undefined;

  const ownQuery = useListMyAchievements({ query: { enabled: !isTutorView } });
  const tutorQuery = useListTutorStudentAchievements(studentId ?? 0, { query: { enabled: isTutorView } });
  const { data, isLoading, isError } = isTutorView ? tutorQuery : ownQuery;
  const subjects = useMemo(() => data ?? [], [data]);

  const view = useSubjectProgressViewStore((state) => state.view);
  const setView = useSubjectProgressViewStore((state) => state.setView);
  const sort = useSubjectProgressViewStore((state) => state.sort);
  const setSort = useSubjectProgressViewStore((state) => state.setSort);

  const sortedSubjects = useMemo(() => sortSubjects(subjects, sort), [subjects, sort]);
  const ungroupedLabel = t("ungroupedGroupLabel");
  const groups = useMemo(
    () => (view === "grouped" ? groupSubjects(sortedSubjects, ungroupedLabel) : null),
    [view, sortedSubjects, ungroupedLabel],
  );

  const sortLabels: Record<SubjectProgressSort, string> = {
    default: t("sortDefault"),
    name: t("sortName"),
    progress_asc: t("sortProgressAsc"),
    progress_desc: t("sortProgressDesc"),
  };

  const subjectHref = (subjectId: number) =>
    isTutorView ? `/tutor/students/${studentId}/subjects/${subjectId}` : `/subjects/${subjectId}`;
  const extraHref = isTutorView ? (subjectId: number) => `/tutor/subjects/${subjectId}` : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium text-gray-500">{t("title")}</h4>
        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                title={t("sortLabel")}
                aria-label={t("sortLabel")}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <ArrowUpDown className="size-3.5" aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className="z-50 min-w-44 rounded-md border border-gray-200 bg-white p-1 shadow-lg"
              >
                {SORT_OPTIONS.map((option) => (
                  <DropdownMenu.Item
                    key={option}
                    onSelect={() => setSort(option)}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs text-gray-700 outline-none data-[highlighted]:bg-gray-100"
                  >
                    {sortLabels[option]}
                    {sort === option && <Check className="size-3.5 text-gray-500" aria-hidden="true" />}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <div className="inline-flex overflow-hidden rounded-md border border-gray-300">
            <button
              type="button"
              onClick={() => setView("ungrouped")}
              aria-pressed={view === "ungrouped"}
              title={t("ungroupedViewLabel")}
              className={`flex items-center p-1 ${
                view === "ungrouped" ? "bg-gray-900 text-white" : "bg-white text-gray-400 hover:bg-gray-50"
              }`}
            >
              <Ungroup className="size-3.5" aria-hidden="true" />
              <span className="sr-only">{t("ungroupedViewLabel")}</span>
            </button>
            <button
              type="button"
              onClick={() => setView("grouped")}
              aria-pressed={view === "grouped"}
              title={t("groupedViewLabel")}
              className={`flex items-center border-l border-gray-300 p-1 ${
                view === "grouped" ? "bg-gray-900 text-white" : "bg-white text-gray-400 hover:bg-gray-50"
              }`}
            >
              <Group className="size-3.5" aria-hidden="true" />
              <span className="sr-only">{t("groupedViewLabel")}</span>
            </button>
          </div>
        </div>
      </div>

      {isLoading && <p className="text-xs text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-xs text-red-600">{t("error")}</p>}
      {!isLoading && !isError && subjects.length === 0 && <p className="text-xs text-gray-500">{t("empty")}</p>}

      {subjects.length > 0 && view === "ungrouped" && (
        <ul className="flex flex-col gap-3">
          {sortedSubjects.map((subject) => (
            <SubjectProgressRow
              key={subject.subject_id}
              subject={subject}
              colorful={colorful}
              href={subjectHref(subject.subject_id)}
              extraHref={extraHref?.(subject.subject_id)}
              extraLabel={t("viewSubjectButton")}
            />
          ))}
        </ul>
      )}

      {subjects.length > 0 && view === "grouped" && groups && (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{group.label}</p>
              <ul className="flex flex-col gap-3">
                {group.items.map((subject) => (
                  <SubjectProgressRow
                    key={subject.subject_id}
                    subject={subject}
                    colorful={colorful}
                    href={subjectHref(subject.subject_id)}
                    extraHref={extraHref?.(subject.subject_id)}
                    extraLabel={t("viewSubjectButton")}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
