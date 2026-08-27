"use client";

import { forwardRef, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { List, Pencil, type LucideIcon, Rows3, Trash2, UserPlus, UserSearch, Users } from "lucide-react";
import { getGetSubjectQueryKey, getListSubjectTopicsQueryKey, useGetSubject, useListSubjectTopics } from "@/lib/api/browser/academics/academics";
import {
  getListTutorSubjectLessonsQueryKey,
  getListTutorSubjectLessonStudentsQueryKey,
  useDeleteTutorLesson,
  useDeleteTutorStudentLesson,
  useDeleteTutorTopic,
  useGetTutorClass,
  useListTutorSubjectLessons,
  useListTutorSubjectLessonStudents,
  useReorderTutorSubjectTopics,
  useSetSubjectFilled,
  useSetTopicBlock,
} from "@/lib/api/browser/tutor/tutor";
import type {
  LessonOut,
  SubjectBlockOut,
  SubjectLessonStudentOut,
  SubjectOut,
  TopicOut,
} from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { Card } from "@/components/card";
import { ExpandAllButton } from "@/components/expand-all-button";
import { ViewModeToggle } from "@/components/view-mode-toggle";
import { getLessonTypeBorderColor } from "@/components/subjects/lesson-type-border-color";
import { groupTopicsByBlock, type BlockGroup } from "@/components/subjects/group-topics-by-block";
import { useSubjectViewStore } from "@/stores/subject-view-store";
import { AssignStudentDialog } from "./assign-student-dialog";
import { LoadLessonsJsonDialog } from "./load-lessons-json-dialog";
import { PlanSubjectLessonsDialog } from "./plan-subject-lessons-dialog";
import { RescheduleAssignmentDialog } from "./reschedule-assignment-dialog";

type ViewMode = "brief" | "full" | "student";

const SCHEDULED_DATE_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", year: "numeric" });

function AssignedStudentsList({ students }: { students: SubjectLessonStudentOut[] }) {
  const t = useTranslations("TutorSubjectDetail");

  return (
    <div className="flex items-start gap-1.5 text-xs text-gray-600">
      <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
      {students.length === 0 ? (
        <span className="text-gray-400">{t("noStudentsAssigned")}</span>
      ) : (
        <span className="flex flex-wrap gap-x-1">
          {students.map((s, index) => (
            <span key={s.student_id}>
              <Link
                href={`/tutor/students/${s.student_id}/calendar`}
                title={SCHEDULED_DATE_FORMAT.format(new Date(s.scheduled_date))}
                className="text-blue-700 hover:underline"
              >
                {s.student_name}
              </Link>
              {index < students.length - 1 && ","}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

// Rendered as a Dialog's `trigger` (AssignStudentDialog, RescheduleAssignmentDialog),
// which Dialog.Trigger asChild clones its own onClick/ref/aria-* props onto —
// must forward all of them to the real <button>, not just render its own, or
// Radix's open-on-click handler never reaches the DOM and the button silently
// does nothing. Card's `href` also makes the whole row a Link (see
// components/card.tsx), so the click must stop bubbling to it too —
// otherwise opening the dialog would also navigate to the lesson page.
// Radix's own click handler (the forwarded `onClick`) is itself built with
// composeEventHandlers, which skips running if the event already has
// defaultPrevented — so preventDefault must come AFTER calling it, not
// before, or the dialog never opens.
const DialogTriggerIconButton = forwardRef<
  HTMLButtonElement,
  { icon: LucideIcon; label: string } & React.ComponentPropsWithoutRef<"button">
>(function DialogTriggerIconButton({ icon: Icon, label, onClick, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        onClick?.(e);
        e.preventDefault();
        e.stopPropagation();
      }}
      className="shrink-0 rounded-md border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50"
      {...props}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
});

// Not a Dialog trigger — a direct action, so it just needs to stop the click
// from bubbling to the surrounding Card link (see DialogTriggerIconButton's
// comment) before confirming and firing the mutation.
function DeleteAssignmentButton({ studentLessonId, onDeleted }: { studentLessonId: number; onDeleted: () => void }) {
  const t = useTranslations("TutorSubjectDetail");
  const deleteAssignment = useDeleteTutorStudentLesson();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(t("deleteAssignmentConfirm"))) return;
    deleteAssignment.mutate(
      { studentLessonId },
      { onSuccess: onDeleted, onError: () => window.alert(t("deleteAssignmentError")) },
    );
  };

  return (
    <button
      type="button"
      title={t("deleteAssignmentButton")}
      aria-label={t("deleteAssignmentButton")}
      onClick={handleClick}
      disabled={deleteAssignment.isPending}
      className="shrink-0 rounded-md border border-red-300 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

// Not a Dialog trigger — direct action, same click-stopping rationale as
// DeleteAssignmentButton above. Disabled (not hidden) when the lesson is
// still assigned to a student, so the tutor sees why deletion is blocked
// instead of the option silently vanishing — the backend enforces the same
// rule (409) regardless.
function DeleteLessonButton({
  lessonId,
  title,
  disabled,
  onDeleted,
}: {
  lessonId: number;
  title: string;
  disabled: boolean;
  onDeleted: () => void;
}) {
  const t = useTranslations("TutorSubjectDetail");
  const deleteLesson = useDeleteTutorLesson();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(t("deleteLessonConfirm", { title }))) return;
    deleteLesson.mutate({ lessonId }, { onSuccess: onDeleted, onError: () => window.alert(t("deleteLessonError")) });
  };

  return (
    <button
      type="button"
      title={disabled ? t("deleteLessonDisabledTitle") : t("deleteLessonButton")}
      aria-label={disabled ? t("deleteLessonDisabledTitle") : t("deleteLessonButton")}
      onClick={handleClick}
      disabled={disabled || deleteLesson.isPending}
      className="shrink-0 rounded-md border border-red-300 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function LessonRow({
  lesson,
  viewMode,
  assignedStudents,
  selectedStudentId,
  onAssignmentChanged,
  onLessonDeleted,
}: {
  lesson: LessonOut;
  viewMode: ViewMode;
  assignedStudents: SubjectLessonStudentOut[];
  selectedStudentId: number | null;
  onAssignmentChanged: () => void;
  onLessonDeleted: () => void;
}) {
  const t = useTranslations("SubjectDetail");
  const tTutor = useTranslations("TutorSubjectDetail");
  const borderColor = getLessonTypeBorderColor(lesson.lesson_type);
  const selectedAssignment =
    selectedStudentId === null ? null : (assignedStudents.find((s) => s.student_id === selectedStudentId) ?? null);

  return (
    <li>
      <Card
        href={`/tutor/lessons/${lesson.id}`}
        className="flex flex-col gap-1.5 border-l-4 bg-white"
        style={{ borderLeftColor: borderColor }}
      >
        {viewMode === "brief" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-900">
              {t("lessonRow", { index: lesson.order_index, title: lesson.title })}
            </span>
            <AssignStudentDialog
              lessonId={lesson.id}
              onAssigned={onAssignmentChanged}
              trigger={<DialogTriggerIconButton icon={UserPlus} label={tTutor("assignToStudentButton")} />}
            />
          </div>
        )}

        {viewMode === "full" && (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-900">{lesson.title}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                <AssignStudentDialog
                  lessonId={lesson.id}
                  onAssigned={onAssignmentChanged}
                  trigger={<DialogTriggerIconButton icon={UserPlus} label={tTutor("assignToStudentButton")} />}
                />
                <DeleteLessonButton
                  lessonId={lesson.id}
                  title={lesson.title}
                  disabled={assignedStudents.length > 0}
                  onDeleted={onLessonDeleted}
                />
              </div>
            </div>
            {lesson.task_content && <p className="text-xs text-gray-500">{lesson.task_content}</p>}
            <AssignedStudentsList students={assignedStudents} />
          </>
        )}

        {viewMode === "student" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-900">{lesson.title}</span>
            {selectedAssignment ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-xs text-gray-500">
                  {SCHEDULED_DATE_FORMAT.format(new Date(selectedAssignment.scheduled_date))}
                </span>
                {selectedAssignment.status !== "completed" && (
                  <RescheduleAssignmentDialog
                    studentLessonId={selectedAssignment.student_lesson_id}
                    currentDate={selectedAssignment.scheduled_date}
                    onRescheduled={onAssignmentChanged}
                    trigger={<DialogTriggerIconButton icon={Pencil} label={tTutor("editAssignmentDateButton")} />}
                  />
                )}
                {selectedAssignment.status === "assigned" && (
                  <DeleteAssignmentButton
                    studentLessonId={selectedAssignment.student_lesson_id}
                    onDeleted={onAssignmentChanged}
                  />
                )}
              </div>
            ) : selectedStudentId !== null ? (
              <AssignStudentDialog
                lessonId={lesson.id}
                defaultStudentId={selectedStudentId}
                onAssigned={onAssignmentChanged}
                trigger={<DialogTriggerIconButton icon={UserPlus} label={tTutor("assignLessonButton")} />}
              />
            ) : (
              <span className="shrink-0 text-xs font-medium text-gray-400">{tTutor("notAssignedToStudent")}</span>
            )}
          </div>
        )}
      </Card>
    </li>
  );
}

// Only rendered by the caller when the subject has more than one block —
// with a single block there's nowhere else to move a topic to.
function TopicBlockSelect({
  topic,
  blocks,
  subjectId,
}: {
  topic: TopicOut;
  blocks: SubjectBlockOut[];
  subjectId: number;
}) {
  const t = useTranslations("TutorSubjectDetail");
  const queryClient = useQueryClient();
  const setTopicBlock = useSetTopicBlock();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const subjectBlockId = Number(e.target.value);
    if (subjectBlockId === topic.subject_block_id) return;

    setTopicBlock.mutate(
      { topicId: topic.id, data: { subject_block_id: subjectBlockId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubjectTopicsQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonsQueryKey(subjectId) });
        },
      },
    );
  };

  return (
    <select
      value={topic.subject_block_id ?? ""}
      onChange={handleChange}
      disabled={setTopicBlock.isPending}
      aria-label={t("moveToBlockLabel")}
      className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700"
    >
      {blocks.map((block) => (
        <option key={block.id} value={block.id}>
          {block.label}
        </option>
      ))}
    </select>
  );
}

// Purely informational — doesn't gate anything, just lets a tutor mark a
// subject's curriculum as fully populated with lessons (Subject.is_filled).
function IsFilledToggle({ subject, subjectId }: { subject: SubjectOut; subjectId: number }) {
  const t = useTranslations("TutorSubjectDetail");
  const queryClient = useQueryClient();
  const setSubjectFilled = useSetSubjectFilled();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSubjectFilled.mutate(
      { subjectId, data: { is_filled: e.target.checked } },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetSubjectQueryKey(subjectId), data);
        },
      },
    );
  };

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={subject.is_filled}
          onChange={handleChange}
          disabled={setSubjectFilled.isPending}
          className="h-4 w-4 rounded border-gray-300"
        />
        {t("isFilledLabel")}
      </label>
      {setSubjectFilled.isError && <span className="text-sm text-red-600">{t("isFilledError")}</span>}
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-300" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M7 4a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm3 6a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zm0 6a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zm4-12a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm3 6a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zm0 6a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
    </svg>
  );
}

function TopicSection({
  topic,
  lessons,
  blocks,
  subjectId,
  expanded,
  onToggle,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  viewMode,
  lessonStudentsByLessonId,
  selectedStudentId,
  onAssignmentChanged,
  onLessonDeleted,
}: {
  topic: TopicOut;
  lessons: LessonOut[];
  blocks: SubjectBlockOut[];
  subjectId: number;
  expanded: boolean;
  onToggle: () => void;
  draggable: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  viewMode: ViewMode;
  lessonStudentsByLessonId: Map<number, SubjectLessonStudentOut[]>;
  selectedStudentId: number | null;
  onAssignmentChanged: () => void;
  onLessonDeleted: () => void;
}) {
  const t = useTranslations("TutorSubjectDetail");
  const queryClient = useQueryClient();
  const deleteTopic = useDeleteTutorTopic();

  const handleDelete = () => {
    if (!window.confirm(t("deleteTopicConfirm", { title: topic.title, count: lessons.length }))) return;

    deleteTopic.mutate(
      { topicId: topic.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubjectTopicsQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonsQueryKey(subjectId) });
        },
      },
    );
  };

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`overflow-hidden rounded-md border border-gray-200 transition-opacity ${isDragging ? "opacity-40" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {draggable && <DragHandleIcon />}
          <ChevronIcon expanded={expanded} />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-gray-900">{topic.title}</span>
            <span className="text-xs text-gray-500">{t("lessonsCount", { count: lessons.length })}</span>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {blocks.length > 1 && <TopicBlockSelect topic={topic} blocks={blocks} subjectId={subjectId} />}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteTopic.isPending}
            className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            🗑️ {t("deleteTopicButton")}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50/50 p-3">
          {deleteTopic.isError && <p className="text-sm text-red-600">{t("deleteTopicError")}</p>}
          {lessons.length === 0 ? (
            <p className="text-sm text-gray-500">{t("noLessonsInTopic")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lessons.map((lesson) => {
                const assignedStudents = lessonStudentsByLessonId.get(lesson.id) ?? [];
                return (
                  <LessonRow
                    key={lesson.id}
                    lesson={lesson}
                    viewMode={viewMode}
                    assignedStudents={assignedStudents}
                    selectedStudentId={selectedStudentId}
                    onAssignmentChanged={onAssignmentChanged}
                    onLessonDeleted={onLessonDeleted}
                  />
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function TutorSubjectDetailPage({ subjectId }: { subjectId: number }) {
  const t = useTranslations("TutorSubjectDetail");
  const queryClient = useQueryClient();

  // Persisted across subjects via subject-view-store, so switching subjects
  // keeps the last chosen view instead of resetting to "brief" every time.
  const viewMode = useSubjectViewStore((s) => s.tutorViewMode);
  const setViewMode = useSubjectViewStore((s) => s.setTutorViewMode);
  const topicsExpandedPreference = useSubjectViewStore((s) => s.tutorTopicsExpanded);
  const setTopicsExpandedPreference = useSubjectViewStore((s) => s.setTutorTopicsExpanded);
  const needsLessonStudents = viewMode !== "brief";

  const subjectQuery = useGetSubject(subjectId);
  const topicsQuery = useListSubjectTopics(subjectId);
  const lessonsQuery = useListTutorSubjectLessons(subjectId);
  const lessonStudentsQuery = useListTutorSubjectLessonStudents(subjectId, {
    query: { enabled: needsLessonStudents },
  });

  const schoolClassId = subjectQuery.data?.school_class_id;
  const classQuery = useGetTutorClass(schoolClassId ?? 0, {
    query: { enabled: viewMode === "student" && schoolClassId !== undefined },
  });

  const topics = useMemo(() => topicsQuery.data ?? [], [topicsQuery.data]);
  const lessons = useMemo(() => lessonsQuery.data ?? [], [lessonsQuery.data]);
  const blocks = useMemo(() => subjectQuery.data?.blocks ?? [], [subjectQuery.data]);
  const classStudents = useMemo(() => classQuery.data?.students ?? [], [classQuery.data]);

  const lessonStudentsByLessonId = useMemo(() => {
    const map = new Map<number, SubjectLessonStudentOut[]>();
    for (const row of lessonStudentsQuery.data ?? []) {
      const list = map.get(row.lesson_id) ?? [];
      list.push(row);
      map.set(row.lesson_id, list);
    }
    return map;
  }, [lessonStudentsQuery.data]);

  const handleAssignmentChanged = () => {
    queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonStudentsQueryKey(subjectId) });
  };

  const handleLessonDeleted = () => {
    queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonsQueryKey(subjectId) });
  };

  const [draftStudentId, setDraftStudentId] = useState<number | "">("");
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode !== "student") {
      setSelectedStudentId(null);
      setDraftStudentId("");
    }
  };

  const handleStudentFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedStudentId(draftStudentId === "" ? null : draftStudentId);
  };

  const lessonsByTopicId = useMemo(() => {
    const map = new Map<number, LessonOut[]>();
    for (const lesson of lessons) {
      const list = map.get(lesson.topic_id) ?? [];
      list.push(lesson);
      map.set(lesson.topic_id, list);
    }
    return map;
  }, [lessons]);

  const blockGroups = useMemo(() => groupTopicsByBlock(topics, blocks), [topics, blocks]);

  const [expandedOverrides, setExpandedOverrides] = useState<Record<number, boolean>>({});
  const isExpanded = (topicId: number) => expandedOverrides[topicId] ?? topicsExpandedPreference ?? false;
  const allExpanded = topics.length > 0 && topics.every((topic) => isExpanded(topic.id));

  const toggleTopic = (topicId: number) => {
    setExpandedOverrides((prev) => ({ ...prev, [topicId]: !isExpanded(topicId) }));
  };

  const toggleAll = () => {
    const next = !allExpanded;
    setTopicsExpandedPreference(next);
    setExpandedOverrides(Object.fromEntries(topics.map((topic) => [topic.id, next])));
  };

  const [draggedTopicId, setDraggedTopicId] = useState<number | null>(null);
  const reorderTopics = useReorderTutorSubjectTopics();
  const setTopicBlockForDrag = useSetTopicBlock();

  const findGroupAndIndex = (topicId: number) => {
    for (const group of blockGroups) {
      const index = group.topics.findIndex((topic) => topic.id === topicId);
      if (index !== -1) return { group, index };
    }
    return null;
  };

  // Drops a topic either onto another topic (inserted immediately before
  // it, targetTopicId set) or onto a group's empty space (appended at the
  // end, targetTopicId null). Recomputes order_index for every topic from
  // the resulting flattened order, then — only when the topic actually
  // changed semester — pins it to the target block so the next
  // assign_topics_to_blocks recompute can't silently move it back.
  const handleDrop = (targetGroup: BlockGroup, targetTopicId: number | null) => {
    if (draggedTopicId === null) return;
    const source = findGroupAndIndex(draggedTopicId);
    setDraggedTopicId(null);
    if (!source) return;
    if (source.group.key === targetGroup.key && targetTopicId === draggedTopicId) return;

    const newGroups = blockGroups.map((group) => ({ ...group, topics: [...group.topics] }));
    const newSourceGroup = newGroups.find((group) => group.key === source.group.key)!;
    const newTargetGroup = newGroups.find((group) => group.key === targetGroup.key)!;

    const sourceIndex = newSourceGroup.topics.findIndex((topic) => topic.id === draggedTopicId);
    const [draggedTopic] = newSourceGroup.topics.splice(sourceIndex, 1);

    let insertIndex = newTargetGroup.topics.length;
    if (targetTopicId !== null) {
      const targetIndex = newTargetGroup.topics.findIndex((topic) => topic.id === targetTopicId);
      if (targetIndex !== -1) insertIndex = targetIndex;
    }
    newTargetGroup.topics.splice(insertIndex, 0, draggedTopic);

    const items = newGroups
      .flatMap((group) => group.topics)
      .map((topic, index) => ({ id: topic.id, order_index: index + 1 }));

    reorderTopics.mutate(
      { subjectId, data: { items } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubjectTopicsQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonsQueryKey(subjectId) });

          if (targetGroup.blockId !== null && targetGroup.blockId !== source.group.blockId) {
            setTopicBlockForDrag.mutate(
              { topicId: draggedTopic.id, data: { subject_block_id: targetGroup.blockId } },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListSubjectTopicsQueryKey(subjectId) });
                },
              },
            );
          }
        },
      },
    );
  };

  const isLoading = subjectQuery.isLoading || topicsQuery.isLoading || lessonsQuery.isLoading;
  const isError = subjectQuery.isError || topicsQuery.isError || lessonsQuery.isError;

  if (isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (isError || !subjectQuery.data) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  const subject = subjectQuery.data;
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("breadcrumbMySubjects"), href: "/tutor/subjects" },
    { label: subject.class_name, href: `/tutor/classes/${subject.school_class_id}` },
    { label: subject.name },
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">{subject.name}</h1>
          <div className="flex flex-wrap items-center gap-1">
            <ViewModeToggle
              value={viewMode}
              onChange={handleViewModeChange}
              options={[
                { value: "brief", icon: List, label: t("viewModeBrief") },
                { value: "full", icon: Rows3, label: t("viewModeFull") },
                { value: "student", icon: UserSearch, label: t("viewModeStudent") },
              ]}
            />
            <div className="mx-1 h-5 w-px bg-gray-200" aria-hidden="true" />
            <ExpandAllButton
              expanded={allExpanded}
              onToggle={toggleAll}
              disabled={topics.length === 0}
              expandLabel={t("expandAll")}
              collapseLabel={t("collapseAll")}
            />
            <PlanSubjectLessonsDialog
              classId={subject.school_class_id}
              subjectId={subjectId}
              subjectName={subject.name}
            />
            <LoadLessonsJsonDialog subjectId={subjectId} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-700">
            {t("classLabel")}: <span className="font-medium">{subject.class_name}</span>
          </p>
          <IsFilledToggle subject={subject} subjectId={subjectId} />
        </div>
      </div>

      {viewMode === "student" && (
        <form
          onSubmit={handleStudentFilterSubmit}
          className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 bg-gray-50/50 p-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="student-filter" className="text-xs font-medium text-gray-700">
              {t("selectStudentLabel")}
            </label>
            <select
              id="student-filter"
              value={draftStudentId}
              onChange={(e) => setDraftStudentId(e.target.value === "" ? "" : Number(e.target.value))}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700"
            >
              <option value="">{t("selectStudentPlaceholder")}</option>
              {classStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={draftStudentId === ""}
            className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("submitButton")}
          </button>
        </form>
      )}

      {topics.length === 0 ? (
        <p className="text-sm text-gray-500">{t("noTopics")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-6">
            {blockGroups.map((group) => {
              const isDropTarget = group.key !== "unassigned";
              return (
                <div
                  key={group.key}
                  onDragOver={(e) => {
                    if (isDropTarget && draggedTopicId !== null) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (!isDropTarget) return;
                    e.preventDefault();
                    handleDrop(group, null);
                  }}
                  className="flex flex-col gap-4"
                >
                  {group.label && <h2 className="text-lg font-semibold text-gray-900">{group.label}</h2>}
                  {group.topics.length === 0 ? (
                    <p className="rounded-md border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-400">
                      {t("emptySemesterDropHint")}
                    </p>
                  ) : (
                    group.topics.map((topic) => (
                      <TopicSection
                        key={topic.id}
                        topic={topic}
                        lessons={lessonsByTopicId.get(topic.id) ?? []}
                        blocks={blocks}
                        subjectId={subjectId}
                        expanded={isExpanded(topic.id)}
                        onToggle={() => toggleTopic(topic.id)}
                        draggable={isDropTarget}
                        isDragging={draggedTopicId === topic.id}
                        onDragStart={(e) => {
                          setDraggedTopicId(topic.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDraggedTopicId(null)}
                        onDragOver={(e) => {
                          if (isDropTarget && draggedTopicId !== null) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          if (!isDropTarget) return;
                          e.preventDefault();
                          e.stopPropagation();
                          handleDrop(group, topic.id);
                        }}
                        viewMode={viewMode}
                        lessonStudentsByLessonId={lessonStudentsByLessonId}
                        selectedStudentId={selectedStudentId}
                        onAssignmentChanged={handleAssignmentChanged}
                        onLessonDeleted={handleLessonDeleted}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
