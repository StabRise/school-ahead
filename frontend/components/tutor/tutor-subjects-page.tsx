"use client";

import { useTranslations } from "next-intl";
import type { AssignmentOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { useTutoringApiListAssignments } from "@/lib/api/browser/tutor/tutor";
import { Card } from "@/components/card";
import { PageContainer } from "@/components/page-container";

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

      <span className="self-start rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
        {assignment.class_name}
      </span>
    </Card>
  );
}

export function TutorSubjectsPage() {
  const t = useTranslations("TutorSubjects");
  const { data, isLoading, isError } = useTutoringApiListAssignments();

  const assignments = data ?? [];

  return (
    <PageContainer title={t("title")} maxWidthClassName="max-w-6xl">
      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {!isLoading && !isError && assignments.length === 0 && (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      )}

      {assignments.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assignments.map((assignment) => (
            <li key={`${assignment.subject_id}-${assignment.class_id}`}>
              <SubjectCard assignment={assignment} />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
