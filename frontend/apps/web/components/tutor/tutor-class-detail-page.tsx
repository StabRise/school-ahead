"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical, RefreshCw } from "lucide-react";
import type { AssignmentOut, TutorStudentOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import {
  getGetTutorClassQueryKey,
  useGetTutorClass,
  useRecalculateClassWorkload,
  useReorderTutorClassSubjects,
} from "@school-ahead/api-client/browser/tutor/tutor";
import { useListSubjectGroups } from "@school-ahead/api-client/browser/academics/academics";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { IsFilledBadge } from "@/components/subjects/is-filled-badge";
import { AttestationTypeBadge } from "@/components/subjects/attestation-type-badge";
import { SimpleEntityIcon } from "@/components/simple/entity-icon";
import { SimplePageContainer } from "@/components/simple/page-container";
import { LoadSubjectMarkdownDialog } from "./load-subject-markdown-dialog";
import { PlanLessonsDialog } from "./plan-lessons-dialog";
import { UploadPlanDialog } from "./upload-plan-dialog";

// Drag handle sits outside the Link — same reasoning as the lesson row on
// the tutor's Subject detail page: native drag-inside-anchor semantics are
// unreliable, and this way the handle never fights the Link's click/
// navigation or the row's own drop target below.
function SubjectRow({
  subject,
  isDragging,
  draggedSubjectId,
  onDragStart,
  onDragEnd,
  onDropOnThisSubject,
}: {
  subject: AssignmentOut;
  isDragging: boolean;
  draggedSubjectId: number | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOnThisSubject: () => void;
}) {
  const t = useTranslations("TutorClassDetail");

  return (
    <li className="flex items-center gap-0.5">
      <span
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        title={t("dragSubjectHandleLabel")}
        aria-label={t("dragSubjectHandleLabel")}
        className="shrink-0 cursor-grab rounded p-1 text-gray-300 hover:text-gray-500 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" aria-hidden="true" />
      </span>
      <Link
        href={`/tutor/subjects/${subject.subject_id}`}
        onDragOver={(e) => {
          if (draggedSubjectId !== null) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDropOnThisSubject();
        }}
        className={`flex min-w-0 flex-1 items-center gap-3 rounded px-2 py-2 hover:bg-gray-50 ${isDragging ? "opacity-40" : ""}`}
      >
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
        <AttestationTypeBadge attestationType={subject.attestation_type} />
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

interface SubjectSection {
  groupId: number | null;
  label: string | null;
  subjects: AssignmentOut[];
}

export function TutorClassDetailPage({ classId }: { classId: number }) {
  const t = useTranslations("TutorClassDetail");
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useGetTutorClass(classId);
  const groupsQuery = useListSubjectGroups();
  const reorderSubjects = useReorderTutorClassSubjects();
  const [draggedSubjectId, setDraggedSubjectId] = useState<number | null>(null);

  // One section per global SubjectGroup (in its own order_index order) plus
  // a trailing "ungrouped" section for subjects with no group set yet —
  // same shape as blockGroups on the tutor's Subject detail page. Subjects
  // within a section are ordered by Subject.order_index, which is relative
  // to the section (group) they're in, not a global position.
  const sections: SubjectSection[] = useMemo(() => {
    const groups = groupsQuery.data ?? [];
    const subjects = data?.subjects ?? [];
    const byGroupId = new Map<number, AssignmentOut[]>();
    const ungrouped: AssignmentOut[] = [];
    for (const subject of subjects) {
      if (subject.group_id === null) {
        ungrouped.push(subject);
      } else {
        const list = byGroupId.get(subject.group_id) ?? [];
        list.push(subject);
        byGroupId.set(subject.group_id, list);
      }
    }
    const sortByOrder = (list: AssignmentOut[]) => [...list].sort((a, b) => a.order_index - b.order_index);
    return [
      ...groups.map((group) => ({
        groupId: group.id,
        label: group.name,
        subjects: sortByOrder(byGroupId.get(group.id) ?? []),
      })),
      { groupId: null, label: groups.length > 0 ? t("ungroupedLabel") : null, subjects: sortByOrder(ungrouped) },
    ];
  }, [data?.subjects, groupsQuery.data, t]);

  const findSection = (subjectId: number) => sections.find((s) => s.subjects.some((sub) => sub.subject_id === subjectId));

  // Drops a subject either onto another subject (inserted immediately
  // before it, targetSubjectId set) or onto a section's empty space
  // (appended at the end, targetSubjectId null). Recomputes order_index
  // per section from the resulting order — index resets at each section
  // boundary since order is relative to the group, not global — and sends
  // the moved subject's new group_id only when it actually changed
  // section.
  const handleSubjectDrop = (targetGroupId: number | null, targetSubjectId: number | null) => {
    if (draggedSubjectId === null) return;
    const sourceSection = findSection(draggedSubjectId);
    setDraggedSubjectId(null);
    if (!sourceSection) return;
    if (sourceSection.groupId === targetGroupId && targetSubjectId === draggedSubjectId) return;

    const newSections = sections.map((section) => ({ ...section, subjects: [...section.subjects] }));
    const newSourceSection = newSections.find((s) => s.groupId === sourceSection.groupId)!;
    const newTargetSection = newSections.find((s) => s.groupId === targetGroupId)!;

    const sourceIndex = newSourceSection.subjects.findIndex((s) => s.subject_id === draggedSubjectId);
    const [draggedSubject] = newSourceSection.subjects.splice(sourceIndex, 1);

    let insertIndex = newTargetSection.subjects.length;
    if (targetSubjectId !== null) {
      const targetIndex = newTargetSection.subjects.findIndex((s) => s.subject_id === targetSubjectId);
      if (targetIndex !== -1) insertIndex = targetIndex;
    }
    newTargetSection.subjects.splice(insertIndex, 0, draggedSubject);

    const items = newSections.flatMap((section) =>
      section.subjects.map((subject, index) => ({
        id: subject.subject_id,
        order_index: index,
        ...(subject.subject_id === draggedSubject.subject_id ? { group_id: targetGroupId } : {}),
      })),
    );

    reorderSubjects.mutate(
      { classId, data: { items } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTutorClassQueryKey(classId) });
        },
      },
    );
  };

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
    <SimplePageContainer>
      <div className="flex flex-col gap-6">
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
          {reorderSubjects.isError && <p className="text-xs text-red-600">{t("subjectReorderError")}</p>}
          {data.subjects.length === 0 ? (
            <p className="text-sm text-gray-500">{t("noSubjects")}</p>
          ) : (
            <div className="flex flex-col gap-5">
              {sections
                .filter((section) => section.subjects.length > 0 || section.groupId !== null)
                .map((section) => (
                  <div
                    key={section.groupId ?? "ungrouped"}
                    onDragOver={(e) => {
                      if (draggedSubjectId !== null) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (draggedSubjectId === null) return;
                      e.preventDefault();
                      handleSubjectDrop(section.groupId, null);
                    }}
                    className="flex flex-col gap-1"
                  >
                    {section.label && <h3 className="px-2 text-xs font-semibold text-gray-500">{section.label}</h3>}
                    {section.subjects.length === 0 ? (
                      <p className="px-2 text-xs text-gray-400">{t("emptyGroupHint")}</p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {section.subjects.map((subject) => (
                          <SubjectRow
                            key={subject.subject_id}
                            subject={subject}
                            isDragging={draggedSubjectId === subject.subject_id}
                            draggedSubjectId={draggedSubjectId}
                            onDragStart={() => setDraggedSubjectId(subject.subject_id)}
                            onDragEnd={() => setDraggedSubjectId(null)}
                            onDropOnThisSubject={() => handleSubjectDrop(section.groupId, subject.subject_id)}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
            </div>
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
    </SimplePageContainer>
  );
}
