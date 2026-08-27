"use client";

import { useTranslations } from "next-intl";
import type { AssignmentOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { useTutoringApiListAssignments } from "@/lib/api/browser/tutor/tutor";
import { Card } from "@/components/card";
import { PageContainer } from "@/components/page-container";
import { IsFilledBadge } from "@/components/subjects/is-filled-badge";

// Deterministic per-subject accent color — same trick as the student view's
// SubjectCard (frontend/components/subjects/subject-card.tsx), AssignmentOut
// still has no color field from the backend.
const ICON_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
];

function SubjectCard({ assignment }: { assignment: AssignmentOut }) {
  const t = useTranslations("TutorSubjects");
  const iconColor = ICON_COLORS[assignment.subject_id % ICON_COLORS.length];

  return (
    <Card
      href={`/tutor/subjects/${assignment.subject_id}`}
      className="flex h-full flex-col gap-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        {assignment.subject_icon ? (
          <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assignment.subject_icon} alt="" className="h-full w-full object-cover" />
          </span>
        ) : (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white ${iconColor}`}
          >
            {assignment.subject_name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="font-medium text-gray-900">{assignment.subject_name}</span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500">
          {t("topicsCount", { count: assignment.topic_count })} ·{" "}
          {t("lessonsCount", { count: assignment.lesson_count })}
        </span>
        <IsFilledBadge isFilled={assignment.is_filled} />
      </div>
    </Card>
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

export function TutorSubjectsPage() {
  const t = useTranslations("TutorSubjects");
  const { data, isLoading, isError } = useTutoringApiListAssignments();

  const assignments = data ?? [];
  const classGroups = groupByClass(assignments);

  return (
    <PageContainer title={t("title")} maxWidthClassName="xl:max-w-6xl">
      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {!isLoading && !isError && assignments.length === 0 && (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      )}

      {classGroups.length > 0 && (
        <div className="flex flex-col gap-8">
          {classGroups.map((group) => (
            <div key={group.classId} className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-gray-900">{group.className}</h2>
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.assignments.map((assignment) => (
                  <li key={assignment.subject_id}>
                    <SubjectCard assignment={assignment} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
