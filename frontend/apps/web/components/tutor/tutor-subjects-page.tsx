"use client";

import { useTranslations } from "next-intl";
import type { AssignmentOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { useTutoringApiListAssignments } from "@school-ahead/api-client/browser/tutor/tutor";
import { Link } from "@/i18n/navigation";
import { SimplePageContainer } from "@/components/simple/page-container";
import { IsFilledBadge } from "@/components/subjects/is-filled-badge";
import { AttestationTypeBadge } from "@/components/subjects/attestation-type-badge";
import { SortableHeader, useSortState } from "@/components/simple/sortable-header";
import { Tabs } from "@/components/tabs";
import { useTabQueryParam } from "@/lib/use-tab-query-param";

// Shared by the header row and every body row so columns line up like a
// real table: subject (flexible, carries the "filled" badge inline) /
// group / topics+lessons meta / attestation.
const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_8rem_10rem_6rem] items-center gap-3";

type SortKey = "name";

function SubjectRow({ assignment }: { assignment: AssignmentOut }) {
  const t = useTranslations("TutorSubjects");
  const tColumn = useTranslations("MySubjects");

  return (
    <li>
      <Link
        href={`/tutor/subjects/${assignment.subject_id}`}
        className={`${ROW_GRID} px-2 py-2 hover:bg-gray-50`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate font-medium text-gray-900">{assignment.subject_name}</span>
          <IsFilledBadge isFilled={assignment.is_filled} />
        </span>
        <span className="truncate text-xs text-gray-500">{assignment.group_name ?? tColumn("noGroupValue")}</span>
        <span className="truncate text-xs text-gray-500">
          {t("topicsCount", { count: assignment.topic_count })} ·{" "}
          {t("lessonsCount", { count: assignment.lesson_count })}
        </span>
        <AttestationTypeBadge attestationType={assignment.attestation_type} />
      </Link>
    </li>
  );
}

interface ClassGroup {
  classId: number;
  className: string;
  assignments: AssignmentOut[];
}

// AssignmentOut carries no class ordering (unlike ClassOut.order_index), so
// classes are sorted by name for a stable, predictable grouping instead of
// whatever order the backend's unordered query happens to return.
function groupByClass(assignments: AssignmentOut[]): ClassGroup[] {
  const groups = new Map<number, ClassGroup>();
  for (const assignment of assignments) {
    const group = groups.get(assignment.class_id);
    if (group) {
      group.assignments.push(assignment);
    } else {
      groups.set(assignment.class_id, {
        classId: assignment.class_id,
        className: assignment.class_name,
        assignments: [assignment],
      });
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.className.localeCompare(b.className));
}

// Notion-style, monochrome, borderless row list grouped by class — replaces
// the Standard shadow-card grid, matching the student Simple views'
// visual language — the same flat redesign later applied to the Subject
// detail page (components/tutor/tutor-subject-detail-page.tsx).
export function TutorSubjectsPage() {
  const t = useTranslations("TutorSubjects");
  const tColumn = useTranslations("MySubjects");
  const { data, isLoading, isError } = useTutoringApiListAssignments();
  const { sort, toggleSort } = useSortState<SortKey>("name");

  const assignments = data ?? [];
  const classGroups = groupByClass(assignments).map((group) => ({
    ...group,
    assignments: [...group.assignments].sort(
      (a, b) => (sort.direction === "asc" ? 1 : -1) * a.subject_name.localeCompare(b.subject_name, "uk"),
    ),
  }));
  const [activeTab, setActiveTab] = useTabQueryParam(
    classGroups[0] ? String(classGroups[0].classId) : "",
  );

  return (
    <SimplePageContainer title={t("title")}>
      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {!isLoading && !isError && assignments.length === 0 && (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      )}

      {classGroups.length > 0 && (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          tabs={classGroups.map((group) => ({
            value: String(group.classId),
            label: t("classTabLabel", { name: group.className }),
            content: (
              <div className="flex flex-col gap-1 overflow-x-auto">
                <div className={`${ROW_GRID} min-w-[32rem] px-2 pb-1`}>
                  <SortableHeader
                    label={tColumn("columnSubject")}
                    active={sort.key === "name"}
                    direction={sort.direction}
                    onClick={() => toggleSort("name")}
                  />
                  <span className="text-xs font-medium text-gray-500">{tColumn("columnGroup")}</span>
                  <span aria-hidden="true" />
                  <span aria-hidden="true" />
                </div>
                <ul className="min-w-[32rem] divide-y divide-gray-100">
                  {group.assignments.map((assignment) => (
                    <SubjectRow key={assignment.subject_id} assignment={assignment} />
                  ))}
                </ul>
              </div>
            ),
          }))}
        />
      )}
    </SimplePageContainer>
  );
}
