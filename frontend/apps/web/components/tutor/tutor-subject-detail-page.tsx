"use client";

import { forwardRef, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Monitor, Pencil, type LucideIcon, Trash2, UserPlus } from "lucide-react";
import { getGetSubjectQueryKey, getListSubjectTopicsQueryKey, useGetSubject, useListSubjectTopics } from "@school-ahead/api-client/browser/academics/academics";
import {
  getListTutorSubjectLessonsQueryKey,
  getListTutorSubjectLessonStudentsQueryKey,
  useDeleteTutorLesson,
  useDeleteTutorStudentLesson,
  useDeleteTutorTopic,
  useGetTutorClass,
  useListTutorSubjectLessons,
  useListTutorSubjectLessonStudents,
  useSetSubjectFilled,
  useSetTopicBlock,
} from "@school-ahead/api-client/browser/tutor/tutor";
import type {
  LessonOut,
  SubjectBlockOut,
  SubjectLessonStudentOut,
  SubjectOut,
  TopicOut,
} from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { SimplePageContainer } from "@/components/simple/page-container";
import { Tabs } from "@/components/tabs";
import { groupTopicsByBlock } from "@/components/subjects/group-topics-by-block";
import { SemesterPlan } from "@/components/subjects/semester-plan";
import { LESSON_TYPE_ICON, LESSON_TYPE_ICON_COLOR } from "@/components/simple/lesson-type-icon";
import { formatGradeLabel, formatShortDate } from "@/components/simple/format";
import { StatusBadge } from "@/components/status-badge";
import { AssignStudentDialog } from "./assign-student-dialog";
import { LoadLessonsJsonDialog } from "./load-lessons-json-dialog";
import { PlanSubjectLessonsDialog } from "./plan-subject-lessons-dialog";
import { RescheduleAssignmentDialog } from "./reschedule-assignment-dialog";

// Rendered as a Dialog's `trigger` (AssignStudentDialog, RescheduleAssignmentDialog),
// which Dialog.Trigger asChild clones its own onClick/ref/aria-* props onto —
// must forward all of them to the real <button>, not just render its own, or
// Radix's open-on-click handler never reaches the DOM and the button silently
// does nothing. The row also wraps everything in a Link (see LessonRow
// below), so the click must stop bubbling to it too — otherwise opening the
// dialog would also navigate to the lesson page. Radix's own click handler
// (the forwarded `onClick`) is itself built with composeEventHandlers, which
// skips running if the event already has defaultPrevented — so
// preventDefault must come AFTER calling it, not before, or the dialog never
// opens.
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
      className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      {...props}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
});

// Not a Dialog trigger — a direct action, so it just needs to stop the click
// from bubbling to the surrounding Link (see DialogTriggerIconButton's
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
      className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
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
      className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

// Same compact icon-row language as the student's own Subject detail page
// (components/subjects/simple-subject-detail-page.tsx's
// SimpleSubjectLessonRow) instead of the previous bordered Card — but keeps
// every tutor action the old card had: assign to a student, delete the
// lesson, and — once a student is picked in the filter below — that
// student's own date/grade with reschedule/remove-assignment actions. A
// single AssignStudentDialog (pre-filled with the filtered student, if any)
// replaces the old two separate assign buttons — the dialog's own picker
// already lets the tutor target any class student, so a second button was
// redundant. Not wrapping per-student names in their own links when no
// student is filtered (unlike the old AssignedStudentsList) — nesting a
// link inside this row's own Link doesn't work, and the same navigation is
// one click away via the student filter or the class roster.
function LessonRow({
  lesson,
  assignedStudents,
  selectedStudentId,
  onAssignmentChanged,
  onLessonDeleted,
}: {
  lesson: LessonOut;
  assignedStudents: SubjectLessonStudentOut[];
  selectedStudentId: number | null;
  onAssignmentChanged: () => void;
  onLessonDeleted: () => void;
}) {
  const t = useTranslations("TutorSubjectDetail");
  const tGrade = useTranslations("LessonWizard");
  const Icon = LESSON_TYPE_ICON[lesson.lesson_type] ?? Monitor;
  const iconColorClass = LESSON_TYPE_ICON_COLOR[lesson.lesson_type] ?? "text-gray-400";
  const selectedAssignment =
    selectedStudentId === null ? null : (assignedStudents.find((s) => s.student_id === selectedStudentId) ?? null);

  const gradeLabel = selectedAssignment
    ? formatGradeLabel({
        gradePoints: selectedAssignment.grade_points,
        gradeResult: selectedAssignment.grade_result,
        t: tGrade,
        bare: true,
      })
    : null;

  return (
    <li>
      <Link
        href={`/tutor/lessons/${lesson.id}`}
        title={lesson.task_content || undefined}
        className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-gray-50"
      >
        <Icon className={`size-3.5 shrink-0 ${iconColorClass}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{lesson.title}</span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {selectedStudentId === null ? (
            <span className="max-w-40 truncate text-[11px] text-gray-400">
              {assignedStudents.length === 0
                ? t("noStudentsAssigned")
                : assignedStudents.map((s) => s.student_name).join(", ")}
            </span>
          ) : selectedAssignment ? (
            <>
              <span className="truncate text-[11px] text-gray-400">
                {formatShortDate(selectedAssignment.scheduled_date)}
                {gradeLabel && ` · ${gradeLabel}`}
              </span>
              <StatusBadge status={selectedAssignment.status} small />
              {selectedAssignment.status !== "completed" && (
                <RescheduleAssignmentDialog
                  studentLessonId={selectedAssignment.student_lesson_id}
                  currentDate={selectedAssignment.scheduled_date}
                  onRescheduled={onAssignmentChanged}
                  trigger={<DialogTriggerIconButton icon={Pencil} label={t("editAssignmentDateButton")} />}
                />
              )}
              {selectedAssignment.status === "assigned" && (
                <DeleteAssignmentButton
                  studentLessonId={selectedAssignment.student_lesson_id}
                  onDeleted={onAssignmentChanged}
                />
              )}
            </>
          ) : (
            <span className="text-[11px] font-medium text-gray-400">{t("notAssignedToStudent")}</span>
          )}
          <AssignStudentDialog
            lessonId={lesson.id}
            defaultStudentId={selectedStudentId ?? undefined}
            onAssigned={onAssignmentChanged}
            trigger={<DialogTriggerIconButton icon={UserPlus} label={t("assignToStudentButton")} />}
          />
          <DeleteLessonButton
            lessonId={lesson.id}
            title={lesson.title}
            disabled={assignedStudents.length > 0}
            onDeleted={onLessonDeleted}
          />
        </span>
      </Link>
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

// Flat topic section — no accordion, no drag handle: every topic's lessons
// are always shown, same as the student's own Subject detail page. Topic
// reordering/block-moving no longer happens by dragging (dropped along with
// the accordion); TopicBlockSelect below is still the way to move a topic
// to a different block.
function TopicSection({
  topic,
  lessons,
  blocks,
  subjectId,
  lessonStudentsByLessonId,
  selectedStudentId,
  onAssignmentChanged,
  onLessonDeleted,
}: {
  topic: TopicOut;
  lessons: LessonOut[];
  blocks: SubjectBlockOut[];
  subjectId: number;
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
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1.5">
        <span className="text-xs font-medium text-gray-500">{topic.title}</span>
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
      {deleteTopic.isError && <p className="px-1.5 text-xs text-red-600">{t("deleteTopicError")}</p>}
      {lessons.length === 0 ? (
        <p className="px-4 text-xs text-gray-400">{t("noLessonsInTopic")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-50 pl-3">
          {lessons.map((lesson) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              assignedStudents={lessonStudentsByLessonId.get(lesson.id) ?? []}
              selectedStudentId={selectedStudentId}
              onAssignmentChanged={onAssignmentChanged}
              onLessonDeleted={onLessonDeleted}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function TutorSubjectDetailPage({ subjectId }: { subjectId: number }) {
  const t = useTranslations("TutorSubjectDetail");
  const queryClient = useQueryClient();

  const subjectQuery = useGetSubject(subjectId);
  const topicsQuery = useListSubjectTopics(subjectId);
  const lessonsQuery = useListTutorSubjectLessons(subjectId);
  // Always fetched — the merged view (no more brief/full/student toggle)
  // always shows the full assigned-students list.
  const lessonStudentsQuery = useListTutorSubjectLessonStudents(subjectId);

  const schoolClassId = subjectQuery.data?.school_class_id;
  // Always fetched once the class is known — the student filter is always
  // visible now, not gated behind a "student" view mode.
  const classQuery = useGetTutorClass(schoolClassId ?? 0, {
    query: { enabled: schoolClassId !== undefined },
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
    <SimplePageContainer>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Breadcrumbs items={breadcrumbItems} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{subject.name}</h1>
            <IsFilledToggle subject={subject} subjectId={subjectId} />
          </div>
          <p className="text-xs text-gray-500">
            {t("classLabel")}: {subject.class_name}
            <span className="mx-1.5 text-gray-300">·</span>
            {t("lessonsCount", { count: lessons.length })}
          </p>
          {selectedStudentId !== null && (
            <p className="flex items-center gap-1 text-xs text-gray-500">
              {t("selectStudentLabel")}: {classStudents.find((s) => s.id === selectedStudentId)?.name ?? "…"}
              <Link
                href={`/tutor/students/${selectedStudentId}/subjects/${subjectId}`}
                title={t("viewStudentSubjectButton")}
                aria-label={t("viewStudentSubjectButton")}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </p>
          )}
        </div>

        <Tabs
          tabs={[
            {
              value: "lessons",
              label: t("lessonsTab"),
              content: (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <PlanSubjectLessonsDialog
                      classId={subject.school_class_id}
                      subjectId={subjectId}
                      subjectName={subject.name}
                    />
                    <LoadLessonsJsonDialog subjectId={subjectId} />
                  </div>

                  <form onSubmit={handleStudentFilterSubmit} className="flex flex-wrap items-end gap-2">
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

                  {topics.length === 0 ? (
                    <p className="text-sm text-gray-500">{t("noTopics")}</p>
                  ) : (
                    <div className="flex flex-col gap-6">
                      {blockGroups.map((group) => (
                        <div key={group.key} className="flex flex-col gap-4">
                          {group.label && (
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              <h2 className="text-base font-semibold text-gray-900">{group.label}</h2>
                              {group.workload !== null && (
                                <span className="text-xs text-gray-500">
                                  {t("workloadLabel", { value: group.workload.toFixed(2) })}
                                </span>
                              )}
                            </div>
                          )}
                          {group.topics.length === 0 ? (
                            <p className="text-sm text-gray-400">{t("emptySemesterHint")}</p>
                          ) : (
                            group.topics.map((topic) => (
                              <TopicSection
                                key={topic.id}
                                topic={topic}
                                lessons={lessonsByTopicId.get(topic.id) ?? []}
                                blocks={blocks}
                                subjectId={subjectId}
                                lessonStudentsByLessonId={lessonStudentsByLessonId}
                                selectedStudentId={selectedStudentId}
                                onAssignmentChanged={handleAssignmentChanged}
                                onLessonDeleted={handleLessonDeleted}
                              />
                            ))
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ),
            },
            {
              value: "plan",
              label: t("planTab"),
              content: <SemesterPlan subjectId={subjectId} />,
            },
          ]}
        />
      </div>
    </SimplePageContainer>
  );
}
