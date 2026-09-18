"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Group, Ungroup } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useGetMySubjects, useListSubjectGroups } from "@school-ahead/api-client/browser/academics/academics";
import { getGetSubjectProgressQueryOptions } from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import { SimplePageContainer } from "@/components/simple/page-container";
import { ProgressBar } from "@/components/progress-bar";
import { AttestationTypeBadge } from "@/components/subjects/attestation-type-badge";
import { SimpleEntityIcon } from "@/components/simple/entity-icon";
import { SortableHeader, useSortState } from "@/components/simple/sortable-header";
import { subjectGroupLabel } from "@/lib/subject-group-label";
import { useTabQueryParam } from "@/lib/use-tab-query-param";
import { useSubjectsGroupedViewStore } from "@/stores/subjects-grouped-view-store";
import type { SubjectOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

// Shared by the header row and every body row so columns line up like a
// real table: icon / subject name (flexible) / group / attestation type /
// progress / percent.
const ROW_GRID = "grid grid-cols-[1.5rem_minmax(0,1fr)_8rem_6rem_8rem_2.5rem] items-center gap-3";

type SortKey = "name" | "progress";

// Not a real SubjectGroup id — selects the bucket of subjects with
// group_id === null, always offered as a tab alongside real groups so
// nothing disappears from view while most subjects are still ungrouped.
const UNGROUPED_TAB_KEY = "ungrouped";

function SimpleSubjectRow({
  subject,
  percent,
  colorful,
}: {
  subject: SubjectOut;
  percent: number;
  colorful?: boolean;
}) {
  const t = useTranslations("MySubjects");
  const activeBlock = subject.blocks.find((block) => block.status === "active");

  return (
    <li>
      <Link href={`/subjects/${subject.id}`} className={`${ROW_GRID} px-2 py-2 hover:bg-gray-50`}>
        <SimpleEntityIcon iconUrl={subject.icon} colorful={colorful} seedId={subject.id} name={subject.name} />
        <span className="min-w-0 truncate">
          <span className="font-medium text-gray-900">{subject.name}</span>
          {colorful && activeBlock && (
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
              {activeBlock.label}
            </span>
          )}
        </span>
        <span className="truncate text-xs text-gray-500">{subject.group_name ?? t("noGroupValue")}</span>
        <AttestationTypeBadge attestationType={subject.attestation_type} />
        <ProgressBar percent={percent} compact colorful={colorful} />
        <span className="text-right text-xs text-gray-500">{percent}%</span>
      </Link>
    </li>
  );
}

// The one subjects-list component for every student role/mode — a dense,
// borderless, sortable list of subject rows instead of the (now-deleted)
// Standard shadowed-card grid. `colorful` (Default mode) restores the
// per-subject colored icon and active-semester pill; Simple mode keeps
// them monochrome/absent. See the Settings page's "Вигляд" section
// (components/settings/view-settings.tsx).
//
// Independent of that interface-mode setting is the grouped/flat toggle
// below (persisted client-side via useSubjectsGroupedViewStore, not
// server-synced like interfaceMode is): flat mode is the existing one
// sortable table; grouped mode splits it into per-SubjectGroup tabs (plus
// an always-present "Без групи" tab) the student switches between.
export function SimpleSubjectsPage({ colorful }: { colorful?: boolean } = {}) {
  const t = useTranslations("MySubjects");
  const { data, isLoading, isError } = useGetMySubjects();
  const { data: subjectGroups } = useListSubjectGroups();
  const { sort, toggleSort } = useSortState<SortKey>("name");
  const grouped = useSubjectsGroupedViewStore((state) => state.grouped);
  const setGrouped = useSubjectsGroupedViewStore((state) => state.setGrouped);
  // Mirrored into `?group=<id>` (or `?group=ungrouped`) so a reload or shared
  // link lands on the same tab. Empty default: with no param the first
  // available tab is used (see effectiveTabKey below).
  const [activeTabKey, setActiveTabKey] = useTabQueryParam("", "group");

  const subjects = useMemo(() => data ?? [], [data]);
  const groups = useMemo(() => subjectGroups ?? [], [subjectGroups]);

  // Progress is fetched once here (rather than per-row, like SubjectCard
  // does) so every subject's percent is available up front to sort by —
  // same useQueries + query-options pattern as CoursePlan's per-topic
  // progress.
  const progressQueries = useQueries({
    queries: subjects.map((subject) => getGetSubjectProgressQueryOptions(subject.id)),
  });
  const percentBySubjectId = useMemo(() => {
    const map = new Map<number, number>();
    subjects.forEach((subject, index) => {
      const percent = progressQueries[index]?.data?.completed_percent ?? 0;
      map.set(subject.id, Math.round(Math.min(100, Math.max(0, percent))));
    });
    return map;
  }, [subjects, progressQueries]);

  const sortedSubjects = useMemo(() => {
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...subjects].sort((a, b) => {
      if (sort.key === "name") {
        return sign * a.name.localeCompare(b.name, "uk");
      }
      return sign * ((percentBySubjectId.get(a.id) ?? 0) - (percentBySubjectId.get(b.id) ?? 0));
    });
  }, [subjects, sort, percentBySubjectId]);

  const subjectCountByTabKey = useMemo(() => {
    const counts = new Map<string, number>();
    for (const subject of subjects) {
      const key = subject.group_id === null ? UNGROUPED_TAB_KEY : String(subject.group_id);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [subjects]);

  // Tabs are keyed by group id (as a string) plus the "ungrouped" bucket —
  // but only those this student's class actually has subjects in: groups
  // are global (not per class), so an empty tab would just be a dead end.
  // Falls back to the first available tab whenever the current selection
  // isn't one of them (no `?group=` yet, or a stale/unknown id).
  const tabGroups = useMemo(
    () => groups.filter((group) => (subjectCountByTabKey.get(String(group.id)) ?? 0) > 0),
    [groups, subjectCountByTabKey],
  );
  const hasUngroupedTab = (subjectCountByTabKey.get(UNGROUPED_TAB_KEY) ?? 0) > 0;
  const tabKeys = useMemo(
    () => [...tabGroups.map((g) => String(g.id)), ...(hasUngroupedTab ? [UNGROUPED_TAB_KEY] : [])],
    [tabGroups, hasUngroupedTab],
  );
  const effectiveTabKey = tabKeys.includes(activeTabKey) ? activeTabKey : tabKeys[0];
  const visibleSubjects = grouped
    ? sortedSubjects.filter((subject) =>
        effectiveTabKey === UNGROUPED_TAB_KEY
          ? subject.group_id === null
          : String(subject.group_id) === effectiveTabKey,
      )
    : sortedSubjects;

  return (
    <SimplePageContainer title={t("title")}>
      <div className="flex flex-wrap items-center justify-end gap-2 pb-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-300">
          <button
            type="button"
            onClick={() => setGrouped(false)}
            aria-pressed={!grouped}
            title={t("ungroupedViewLabel")}
            className={`flex items-center px-2 py-1.5 ${!grouped ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >
            <Ungroup className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("ungroupedViewLabel")}</span>
          </button>
          <button
            type="button"
            onClick={() => setGrouped(true)}
            aria-pressed={grouped}
            title={t("groupedViewLabel")}
            className={`flex items-center border-l border-gray-300 px-2 py-1.5 ${grouped ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >
            <Group className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("groupedViewLabel")}</span>
          </button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {!isLoading && !isError && subjects.length === 0 && <p className="text-sm text-gray-500">{t("empty")}</p>}

      {subjects.length > 0 && (
        <div className="flex flex-col gap-2">
          {grouped && (
            <div role="tablist" className="flex flex-wrap gap-1 border-b border-gray-200">
              {tabGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  role="tab"
                  aria-selected={effectiveTabKey === String(group.id)}
                  onClick={() => setActiveTabKey(String(group.id))}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                    effectiveTabKey === String(group.id)
                      ? "border-gray-900 text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {subjectGroupLabel(group.name, subjectCountByTabKey.get(String(group.id)) ?? 0)}
                </button>
              ))}
              {hasUngroupedTab && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveTabKey === UNGROUPED_TAB_KEY}
                  onClick={() => setActiveTabKey(UNGROUPED_TAB_KEY)}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                    effectiveTabKey === UNGROUPED_TAB_KEY
                      ? "border-gray-900 text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {subjectGroupLabel(t("ungroupedTabLabel"), subjectCountByTabKey.get(UNGROUPED_TAB_KEY) ?? 0)}
                </button>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <div className={`${ROW_GRID} min-w-[34rem] px-2 pb-2`}>
              <span aria-hidden="true" />
              <SortableHeader
                label={t("columnSubject")}
                active={sort.key === "name"}
                direction={sort.direction}
                onClick={() => toggleSort("name")}
              />
              <span className="text-xs font-medium text-gray-500">{t("columnGroup")}</span>
              <span className="text-xs font-medium text-gray-500">{t("columnAttestation")}</span>
              <SortableHeader
                label={t("progressLabel")}
                active={sort.key === "progress"}
                direction={sort.direction}
                onClick={() => toggleSort("progress")}
              />
              <span aria-hidden="true" />
            </div>
            {visibleSubjects.length === 0 ? (
              <p className="px-2 text-sm text-gray-500">{t("emptyGroupTab")}</p>
            ) : (
              <ul className="min-w-[34rem] divide-y divide-gray-100">
                {visibleSubjects.map((subject) => (
                  <SimpleSubjectRow
                    key={subject.id}
                    subject={subject}
                    percent={percentBySubjectId.get(subject.id) ?? 0}
                    colorful={colorful}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </SimplePageContainer>
  );
}
