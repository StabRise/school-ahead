"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, Crown, Eye, EyeOff, GripVertical, RefreshCw } from "lucide-react";
import type {
  AssignmentOut,
  SubjectGroupOut,
  TutorStudentOut,
} from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import {
  getGetTutorClassQueryKey,
  useGetTutorClass,
  useRecalculateClassWorkload,
  useReorderTutorClassSubjects,
  useReorderTutorSubjectGroups,
  useSetSubjectGroupMarked,
  useSetSubjectMarked,
} from "@school-ahead/api-client/browser/tutor/tutor";
import { getListSubjectGroupsQueryKey, useListSubjectGroups } from "@school-ahead/api-client/browser/academics/academics";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { IsFilledBadge } from "@/components/subjects/is-filled-badge";
import { AttestationTypeBadge } from "@/components/subjects/attestation-type-badge";
import { SimpleEntityIcon } from "@/components/simple/entity-icon";
import { SimplePageContainer } from "@/components/simple/page-container";
import { Tabs } from "@/components/tabs";
import { moveGroup } from "@/lib/move-group";
import { subjectGroupLabel } from "@/lib/subject-group-label";
import { useTabQueryParam } from "@/lib/use-tab-query-param";
import { CreateSubjectDialog } from "./create-subject-dialog";
import { LoadSubjectMarkdownDialog } from "./load-subject-markdown-dialog";
import { PlanLessonsDialog } from "./plan-lessons-dialog";
import { UploadPlanDialog } from "./upload-plan-dialog";
import { useDialogs } from "@/components/dialogs/app-dialogs";

// The eye on a subject row or a group header: whether the students' preschool
// bookshelf shows it by default (Subject.is_marked / SubjectGroup.is_marked).
// A group's is global, like its order.
function ShelfMarkButton({
  marked,
  disabled,
  onToggle,
}: {
  marked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("TutorClassDetail");
  const label = marked ? t("shownOnShelfLabel") : t("hiddenOnShelfLabel");
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={marked}
      title={label}
      aria-label={label}
      className={`shrink-0 rounded p-1 hover:bg-gray-100 disabled:opacity-50 ${
        marked ? "text-emerald-600 hover:text-emerald-700" : "text-gray-300 hover:text-gray-500"
      }`}
    >
      {marked ? (
        <Eye className="size-4" aria-hidden="true" />
      ) : (
        <EyeOff className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}

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
  onToggleMarked,
  markPending,
}: {
  subject: AssignmentOut;
  isDragging: boolean;
  draggedSubjectId: number | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOnThisSubject: () => void;
  onToggleMarked: () => void;
  markPending: boolean;
}) {
  const t = useTranslations("TutorClassDetail");
  const workloadValue = subject.block_workloads.map((w) => (w === null ? "—" : w.toFixed(2))).join(" / ");

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
            <span
              className="text-xs text-gray-500"
              title={t("workloadLabel", { value: workloadValue })}
            >
              {workloadValue}
            </span>
          )}
        </div>
        <AttestationTypeBadge attestationType={subject.attestation_type} />
        <IsFilledBadge isFilled={subject.is_filled} />
      </Link>
      <ShelfMarkButton marked={subject.is_marked} disabled={markPending} onToggle={onToggleMarked} />
    </li>
  );
}

function StudentRow({ student }: { student: TutorStudentOut }) {
  const t = useTranslations("TutorClassDetail");

  return (
    <li className="flex items-center justify-between gap-3">
      <Link
        href={`/tutor/students/${student.id}`}
        className="flex min-w-0 flex-1 items-center rounded px-2 py-2 hover:bg-gray-50"
      >
        <span className="font-medium text-gray-900">{student.name}</span>
      </Link>
      <Link
        href={`/tutor/students/${student.id}/calendar`}
        title={t("viewCalendarButton")}
        aria-label={t("viewCalendarButton")}
        className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        <Calendar className="size-4" aria-hidden="true" />
      </Link>
    </li>
  );
}

function RecalculateWorkloadButton({ classId }: { classId: number }) {
  const t = useTranslations("TutorClassDetail");
  const dialogs = useDialogs();
  const queryClient = useQueryClient();
  const recalculate = useRecalculateClassWorkload();

  const handleClick = () => {
    recalculate.mutate(
      { classId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTutorClassQueryKey(classId) });
        },
        onError: () => dialogs.error(t("recalculateWorkloadError")),
      },
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={recalculate.isPending}
      title={t("recalculateWorkloadButton")}
      aria-label={t("recalculateWorkloadButton")}
      className="flex shrink-0 items-center justify-center rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      <RefreshCw className={`h-4 w-4 ${recalculate.isPending ? "animate-spin" : ""}`} aria-hidden="true" />
    </button>
  );
}

// Not a real SubjectGroup id — the `?group=` value for the tab of subjects
// with group_id === null.
const UNGROUPED_TAB_KEY = "ungrouped";

interface SubjectSection {
  groupId: number | null;
  label: string | null;
  // Whether the group is marked for the students' shelf; null for the
  // "ungrouped" section, which isn't a group.
  isMarked: boolean | null;
  subjects: AssignmentOut[];
}

export function TutorClassDetailPage({ classId }: { classId: number }) {
  const t = useTranslations("TutorClassDetail");
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useGetTutorClass(classId);
  const groupsQuery = useListSubjectGroups();
  const reorderSubjects = useReorderTutorClassSubjects();
  const reorderGroups = useReorderTutorSubjectGroups();
  const setSubjectMarked = useSetSubjectMarked();
  const setGroupMarked = useSetSubjectGroupMarked();
  const [draggedSubjectId, setDraggedSubjectId] = useState<number | null>(null);
  const [draggedGroupId, setDraggedGroupId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useTabQueryParam("subjects");
  // Mirrored into `?group=<id>` (or `?group=ungrouped`), same as the
  // student subjects list's group tabs (simple-subjects-page.tsx).
  const [activeGroupKey, setActiveGroupKey] = useTabQueryParam("", "group");

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
        isMarked: group.is_marked,
        subjects: sortByOrder(byGroupId.get(group.id) ?? []),
      })),
      {
        groupId: null,
        label: groups.length > 0 ? t("ungroupedLabel") : null,
        isMarked: null,
        subjects: sortByOrder(ungrouped),
      },
    ];
  }, [data?.subjects, groupsQuery.data, t]);

  // Every group gets a tab, even an empty one — it's still a drop target for
  // moving a subject into that group. "Ungrouped" only while it has subjects.
  const visibleSections = sections.filter((section) => section.subjects.length > 0 || section.groupId !== null);
  const sectionKeyOf = (section: SubjectSection) => (section.groupId === null ? UNGROUPED_TAB_KEY : String(section.groupId));
  const activeSection = visibleSections.find((section) => sectionKeyOf(section) === activeGroupKey) ?? visibleSections[0];

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

  const toggleSubjectMarked = (subject: AssignmentOut) =>
    setSubjectMarked.mutate(
      { subjectId: subject.subject_id, data: { is_marked: !subject.is_marked } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTutorClassQueryKey(classId) }) },
    );

  const toggleGroupMarked = (groupId: number, isMarked: boolean) =>
    setGroupMarked.mutate(
      { groupId, data: { is_marked: !isMarked } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSubjectGroupsQueryKey() }) },
    );

  // Drops a group onto another group's section (it takes that group's place)
  // or onto the "ungrouped" section (it goes last). Unlike a subject's order,
  // a group's is global — every class and the students' bookshelf filter show
  // the same one — so this changes it everywhere. The list is reordered on
  // screen at once and put back if the request fails, rather than waiting
  // for the server to answer.
  const handleGroupDrop = (targetGroupId: number | null) => {
    if (draggedGroupId === null) return;
    const groups = groupsQuery.data ?? [];
    const order = moveGroup(
      groups.map((group) => group.id),
      draggedGroupId,
      targetGroupId,
    );
    setDraggedGroupId(null);
    if (!order) return;

    const queryKey = getListSubjectGroupsQueryKey();
    const previous = queryClient.getQueryData<SubjectGroupOut[]>(queryKey);
    queryClient.setQueryData<SubjectGroupOut[]>(
      queryKey,
      order.map((id, index) => ({ ...groups.find((group) => group.id === id)!, order_index: index })),
    );
    reorderGroups.mutate(
      { data: { items: order.map((id, index) => ({ id, order_index: index })) } },
      {
        onError: () => queryClient.setQueryData(queryKey, previous),
        onSettled: () => queryClient.invalidateQueries({ queryKey }),
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
              <h1 className="text-2xl font-semibold text-gray-900">{t("classTitle", { name: data.name })}</h1>
              {data.is_class_teacher && (
                <span
                  title={t("youAreClassTeacher")}
                  aria-label={t("youAreClassTeacher")}
                  className="flex shrink-0 items-center rounded-full bg-blue-100 p-1 text-blue-700"
                >
                  <Crown className="size-3.5" aria-hidden="true" />
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {data.is_class_teacher && <CreateSubjectDialog classId={classId} academicYear={data.academic_year} />}
              <RecalculateWorkloadButton classId={classId} />
              {data.is_class_teacher && <UploadPlanDialog classId={classId} />}
              {data.is_class_teacher && <LoadSubjectMarkdownDialog classId={classId} />}
              <PlanLessonsDialog classId={classId} />
            </div>
          </div>
          {!data.is_class_teacher && (
            <p className="text-sm text-gray-700">
              {t("classTeacherLabel")}:{" "}
              <span className="font-medium">{data.class_teacher_name ?? t("classTeacherUnset")}</span>
            </p>
          )}
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          tabs={[
            {
              value: "subjects",
              label: t("subjectsTitle"),
              content: (
                <div className="flex flex-col gap-3">
                  {reorderSubjects.isError && <p className="text-xs text-red-600">{t("subjectReorderError")}</p>}
                  {reorderGroups.isError && <p className="text-xs text-red-600">{t("groupReorderError")}</p>}
                  {(setSubjectMarked.isError || setGroupMarked.isError) && (
                    <p className="text-xs text-red-600">{t("markError")}</p>
                  )}
                  {data.subjects.length === 0 ? (
                    <p className="text-sm text-gray-500">{t("noSubjects")}</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div role="tablist" className="flex flex-wrap gap-1 border-b border-gray-200">
                        {visibleSections.map((section) => {
                          const sectionKey = sectionKeyOf(section);
                          const isActive = activeSection === section;
                          const label = section.label ?? t("ungroupedLabel");
                          return (
                            <div
                              key={sectionKey}
                              // A tab is a drop target: a subject dropped on it moves to the
                              // end of that group, a group dropped on it takes its place.
                              onDragOver={(e) => {
                                if (draggedSubjectId !== null || draggedGroupId !== null) e.preventDefault();
                              }}
                              onDrop={(e) => {
                                if (draggedGroupId !== null) {
                                  e.preventDefault();
                                  handleGroupDrop(section.groupId);
                                  return;
                                }
                                if (draggedSubjectId === null) return;
                                e.preventDefault();
                                handleSubjectDrop(section.groupId, null);
                              }}
                              className={`-mb-px flex items-center gap-0.5 border-b-2 ${
                                isActive ? "border-gray-900" : "border-transparent"
                              } ${draggedGroupId !== null && draggedGroupId === section.groupId ? "opacity-40" : ""}`}
                            >
                              {/* A group can be dragged by its handle, outside the tab button for
                                  the same reason as the subject row's handle. Not the "ungrouped"
                                  tab, and pointless with a single group. */}
                              {section.groupId !== null && (groupsQuery.data?.length ?? 0) > 1 && (
                                <span
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = "move";
                                    setDraggedGroupId(section.groupId);
                                  }}
                                  onDragEnd={() => setDraggedGroupId(null)}
                                  title={t("dragGroupHandleLabel")}
                                  aria-label={t("dragGroupHandleLabel")}
                                  className="shrink-0 cursor-grab rounded p-0.5 text-gray-300 hover:text-gray-500 active:cursor-grabbing"
                                >
                                  <GripVertical className="size-3.5" aria-hidden="true" />
                                </span>
                              )}
                              <button
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => setActiveGroupKey(sectionKey)}
                                className={`px-2 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                                  isActive ? "text-gray-900" : "text-gray-500 hover:text-gray-900"
                                }`}
                              >
                                {subjectGroupLabel(label, section.subjects.length)}
                              </button>
                              {section.groupId !== null && section.isMarked !== null && (
                                <ShelfMarkButton
                                  marked={section.isMarked}
                                  disabled={setGroupMarked.isPending}
                                  onToggle={() => toggleGroupMarked(section.groupId!, section.isMarked!)}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {activeSection && (
                        <div
                          role="tabpanel"
                          onDragOver={(e) => {
                            if (draggedSubjectId !== null) e.preventDefault();
                          }}
                          onDrop={(e) => {
                            // Already handled by a SubjectRow (dropped onto a subject).
                            if (draggedSubjectId === null || e.defaultPrevented) return;
                            e.preventDefault();
                            handleSubjectDrop(activeSection.groupId, null);
                          }}
                          className="min-h-16"
                        >
                          {activeSection.subjects.length === 0 ? (
                            <p className="px-2 py-2 text-xs text-gray-400">{t("emptyGroupHint")}</p>
                          ) : (
                            <ul className="divide-y divide-gray-100">
                              {activeSection.subjects.map((subject) => (
                                <SubjectRow
                                  key={subject.subject_id}
                                  subject={subject}
                                  isDragging={draggedSubjectId === subject.subject_id}
                                  draggedSubjectId={draggedSubjectId}
                                  onDragStart={() => setDraggedSubjectId(subject.subject_id)}
                                  onDragEnd={() => setDraggedSubjectId(null)}
                                  onDropOnThisSubject={() =>
                                    handleSubjectDrop(activeSection.groupId, subject.subject_id)
                                  }
                                  onToggleMarked={() => toggleSubjectMarked(subject)}
                                  markPending={setSubjectMarked.isPending}
                                />
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ),
            },
            {
              value: "students",
              label: t("studentsTitle"),
              content:
                data.students.length === 0 ? (
                  <p className="text-sm text-gray-500">{t("noStudents")}</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {data.students.map((student) => (
                      <StudentRow key={student.id} student={student} />
                    ))}
                  </ul>
                ),
            },
          ]}
        />
      </div>
    </SimplePageContainer>
  );
}
