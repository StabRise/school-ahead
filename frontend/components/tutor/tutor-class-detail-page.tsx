"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import type { AssignmentOut, TutorStudentOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { getGetTutorClassQueryKey, useGetTutorClass, useRecalculateClassWorkload } from "@/lib/api/browser/tutor/tutor";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { IsFilledBadge } from "@/components/subjects/is-filled-badge";
import { SimpleEntityIcon } from "@/components/simple/entity-icon";
import { LoadSubjectMarkdownDialog } from "./load-subject-markdown-dialog";
import { PlanLessonsDialog } from "./plan-lessons-dialog";
import { UploadPlanDialog } from "./upload-plan-dialog";

function SubjectRow({ subject }: { subject: AssignmentOut }) {
  const t = useTranslations("TutorClassDetail");

  return (
    <li>
      <Link href={`/tutor/subjects/${subject.subject_id}`} className="flex items-center gap-3 rounded px-2 py-2 hover:bg-gray-50">
        <SimpleEntityIcon iconUrl={subject.subject_icon} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium text-gray-900">{subject.subject_name}</span>
          <span className="text-xs text-gray-500">
            {t("topicsCount", { count: subject.topic_count })} ·{" "}
            {t("lessonsCount", { count: subject.lesson_count })}
          </span>
          {subject.block_workloads.length > 0 && (
            <span className="text-xs text-gray-500">
              {t("workloadLabel", {
                value: subject.block_workloads.map((w) => (w === null ? "—" : w.toFixed(2))).join(" / "),
              })}
            </span>
          )}
        </div>
        <IsFilledBadge isFilled={subject.is_filled} />
      </Link>
    </li>
  );
}

function StudentRow({ student }: { student: TutorStudentOut }) {
  return (
    <li>
      <Link
        href={`/tutor/students/${student.id}/calendar`}
        className="flex items-center justify-between gap-3 rounded px-2 py-2 hover:bg-gray-50"
      >
        <span className="font-medium text-gray-900">{student.name}</span>
      </Link>
    </li>
  );
}

function RecalculateWorkloadButton({ classId }: { classId: number }) {
  const t = useTranslations("TutorClassDetail");
  const queryClient = useQueryClient();
  const recalculate = useRecalculateClassWorkload();

  const handleClick = () => {
    recalculate.mutate(
      { classId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTutorClassQueryKey(classId) });
        },
        onError: () => window.alert(t("recalculateWorkloadError")),
      },
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={recalculate.isPending}
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      <RefreshCw className={`h-4 w-4 ${recalculate.isPending ? "animate-spin" : ""}`} />
      {t("recalculateWorkloadButton")}
    </button>
  );
}

export function TutorClassDetailPage({ classId }: { classId: number }) {
  const t = useTranslations("TutorClassDetail");
  const { data, isLoading, isError } = useGetTutorClass(classId);

  if (isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (isError || !data) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("breadcrumbMyClasses"), href: "/tutor/classes" },
    { label: data.name },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{data.name}</h1>
            {data.is_class_teacher && <span className="shrink-0 text-xs text-gray-500">{t("youAreClassTeacher")}</span>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <RecalculateWorkloadButton classId={classId} />
            {data.is_class_teacher && <UploadPlanDialog classId={classId} />}
            {data.is_class_teacher && <LoadSubjectMarkdownDialog classId={classId} />}
            <PlanLessonsDialog classId={classId} />
          </div>
        </div>
        <p className="text-sm text-gray-700">
          {t("classTeacherLabel")}:{" "}
          <span className="font-medium">{data.class_teacher_name ?? t("classTeacherUnset")}</span>
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-gray-900">{t("subjectsTitle")}</h2>
        {data.subjects.length === 0 ? (
          <p className="text-sm text-gray-500">{t("noSubjects")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.subjects.map((subject) => (
              <SubjectRow key={subject.subject_id} subject={subject} />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-gray-900">{t("studentsTitle")}</h2>
        {data.students.length === 0 ? (
          <p className="text-sm text-gray-500">{t("noStudents")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.students.map((student) => (
              <StudentRow key={student.id} student={student} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
