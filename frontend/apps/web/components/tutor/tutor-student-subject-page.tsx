"use client";

import { forwardRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Monitor, Pencil, type LucideIcon, Trash2, UserPlus } from "lucide-react";
import { useGetSubject, useListSubjectTopics } from "@school-ahead/api-client/browser/academics/academics";
import {
  getListTutorSubjectLessonStudentsQueryKey,
  useDeleteTutorStudentLesson,
  useGetTutorStudent,
  useListTutorStudentAchievements,
  useListTutorSubjectLessons,
  useListTutorSubjectLessonStudents,
} from "@school-ahead/api-client/browser/tutor/tutor";
import type { LessonOut, SubjectLessonStudentOut, TopicOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { SimplePageContainer } from "@/components/simple/page-container";
import { ProgressBar } from "@/components/progress-bar";
import { Tabs } from "@/components/tabs";
import { SemesterPlan } from "@/components/subjects/semester-plan";
import { LESSON_TYPE_ICON, LESSON_TYPE_ICON_COLOR } from "@/components/simple/lesson-type-icon";
import { formatGradeLabel, formatShortDate } from "@/components/simple/format";
import { StatusBadge } from "@/components/status-badge";
import { AssignStudentDialog } from "./assign-student-dialog";
import { RescheduleAssignmentDialog } from "./reschedule-assignment-dialog";

// Rendered as RescheduleAssignmentDialog's `trigger`, which Dialog.Trigger
// asChild clones its own onClick/ref/aria-* props onto — must forward all
// of them to the real <button>, not just render its own. The row also
// wraps everything in a Link (see TutorSubjectLessonRow below), so the
// click must stop bubbling to it too, or opening the dialog would also
// navigate to the lesson page. Same pattern as
// tutor-subject-detail-page.tsx's DialogTriggerIconButton.
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

// Not a Dialog trigger — a direct action, so it just needs to stop the
// click from bubbling to the surrounding Link before confirming and firing
// the mutation.
function RemoveAssignmentButton({ studentLessonId, onDeleted }: { studentLessonId: number; onDeleted: () => void }) {
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

// Same visual language as the student's own Subject detail page's lesson
// row (components/subjects/simple-subject-detail-page.tsx's
// SimpleSubjectLessonRow) — tiny lesson-type icon, title, trailing meta —
// but sourced from the tutor-scoped lesson/assignment queries instead of
// the self-service one (there's no merged "SubjectLessonOut" for an
// arbitrary other student), linking to the tutor's own lesson page
// (/tutor/lessons/{id}, viewable regardless of assignment, unlike the
// student's own row which only links once assigned), and with the
// assign/reschedule/remove-assignment actions the tutor needs that the
// student's own read-only row has no reason for.
function TutorSubjectLessonRow({
  lesson,
  studentId,
  assignment,
  onAssignmentChanged,
}: {
  lesson: LessonOut;
  studentId: number;
  assignment: SubjectLessonStudentOut | undefined;
  onAssignmentChanged: () => void;
}) {
  const t = useTranslations("TutorSubjectDetail");
  const tGrade = useTranslations("LessonWizard");
  const Icon = LESSON_TYPE_ICON[lesson.lesson_type] ?? Monitor;
  const iconColorClass = LESSON_TYPE_ICON_COLOR[lesson.lesson_type] ?? "text-gray-400";

  const gradeLabel = assignment
    ? formatGradeLabel({ gradePoints: assignment.grade_points, gradeResult: assignment.grade_result, t: tGrade, bare: true })
    : null;

  const metaParts = [
    assignment ? formatShortDate(assignment.scheduled_date) : t("notAssignedToStudent"),
    gradeLabel,
  ].filter(Boolean);

  return (
    <li>
      <Link
        href={`/tutor/lessons/${lesson.id}`}
        className={`flex items-center gap-2 rounded px-1.5 py-1 hover:bg-gray-50 ${assignment ? "" : "opacity-60"}`}
      >
        <Icon className={`size-3.5 shrink-0 ${iconColorClass}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{lesson.title}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {metaParts.length > 0 && <span className="truncate text-[11px] text-gray-400">{metaParts.join(" · ")}</span>}
          {assignment?.status && <StatusBadge status={assignment.status} small />}
          {assignment && assignment.status !== "completed" && (
            <RescheduleAssignmentDialog
              studentLessonId={assignment.student_lesson_id}
              currentDate={assignment.scheduled_date}
              onRescheduled={onAssignmentChanged}
              trigger={<DialogTriggerIconButton icon={Pencil} label={t("editAssignmentDateButton")} />}
            />
          )}
          {assignment?.status === "assigned" && (
            <RemoveAssignmentButton studentLessonId={assignment.student_lesson_id} onDeleted={onAssignmentChanged} />
          )}
          {!assignment && (
            <AssignStudentDialog
              lessonId={lesson.id}
              defaultStudentId={studentId}
              onAssigned={onAssignmentChanged}
              trigger={<DialogTriggerIconButton icon={UserPlus} label={t("assignToStudentButton")} />}
            />
          )}
        </span>
      </Link>
    </li>
  );
}

function TopicSection({
  topic,
  lessons,
  studentId,
  assignmentByLessonId,
  onAssignmentChanged,
}: {
  topic: TopicOut;
  lessons: LessonOut[];
  studentId: number;
  assignmentByLessonId: Map<number, SubjectLessonStudentOut>;
  onAssignmentChanged: () => void;
}) {
  const t = useTranslations("TutorSubjectDetail");

  return (
    <div className="flex flex-col gap-1">
      <div className="px-1.5 text-xs font-medium text-gray-500">{topic.title}</div>
      {lessons.length === 0 ? (
        <p className="px-4 text-xs text-gray-400">{t("noLessonsInTopic")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-50 pl-3">
          {lessons.map((lesson) => (
            <TutorSubjectLessonRow
              key={lesson.id}
              lesson={lesson}
              studentId={studentId}
              assignment={assignmentByLessonId.get(lesson.id)}
              onAssignmentChanged={onAssignmentChanged}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// One student's view of one subject, from the tutor's side — reached from
// that student's "Статистика" tab (components/tutor/
// tutor-student-overview-page.tsx's SubjectStatsTab). Deliberately mirrors
// the student's own /subjects/[subjectId] page
// (components/subjects/simple-subject-detail-page.tsx) — same header/
// progress-bar/Lessons+Plan-tabs/flat-topic-list shape — rather than the
// general /tutor/subjects/[subjectId] page's editable accordion (topic
// reordering, block assignment, lesson creation/deletion), since none of
// that curriculum editing makes sense scoped to a single student. Only a
// scheduled lesson's StudentLesson assignment can be removed or
// rescheduled here — the Lesson itself (and the subject's curriculum) is
// left alone.
export function TutorStudentSubjectPage({ subjectId, studentId }: { subjectId: number; studentId: number }) {
  const t = useTranslations("TutorSubjectDetail");
  const queryClient = useQueryClient();

  const studentQuery = useGetTutorStudent(studentId);
  const subjectQuery = useGetSubject(subjectId);
  const topicsQuery = useListSubjectTopics(subjectId);
  const lessonsQuery = useListTutorSubjectLessons(subjectId);
  const lessonStudentsQuery = useListTutorSubjectLessonStudents(subjectId);
  const achievementsQuery = useListTutorStudentAchievements(studentId);

  const topics = useMemo(() => topicsQuery.data ?? [], [topicsQuery.data]);
  const lessons = useMemo(() => lessonsQuery.data ?? [], [lessonsQuery.data]);

  const lessonsByTopicId = useMemo(() => {
    const map = new Map<number, LessonOut[]>();
    for (const lesson of lessons) {
      const list = map.get(lesson.topic_id) ?? [];
      list.push(lesson);
      map.set(lesson.topic_id, list);
    }
    return map;
  }, [lessons]);

  // Filtered down to this one student — useListTutorSubjectLessonStudents
  // returns every student's assignment rows for the subject.
  const assignmentByLessonId = useMemo(() => {
    const map = new Map<number, SubjectLessonStudentOut>();
    for (const row of lessonStudentsQuery.data ?? []) {
      if (row.student_id === studentId) map.set(row.lesson_id, row);
    }
    return map;
  }, [lessonStudentsQuery.data, studentId]);

  const handleAssignmentChanged = () => {
    queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonStudentsQueryKey(subjectId) });
  };

  const isLoading = studentQuery.isLoading || subjectQuery.isLoading || topicsQuery.isLoading || lessonsQuery.isLoading;
  const isError = studentQuery.isError || subjectQuery.isError || topicsQuery.isError || lessonsQuery.isError;

  if (isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (isError || !studentQuery.data || !subjectQuery.data) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  const student = studentQuery.data;
  const subject = subjectQuery.data;
  const percent = achievementsQuery.data?.find((a) => a.subject_id === subjectId)?.completed_percent ?? 0;
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("breadcrumbMyClasses"), href: "/tutor/classes" },
    { label: student.class_name, href: `/tutor/classes/${student.class_id}` },
    { label: student.name, href: `/tutor/students/${studentId}` },
    { label: subject.name },
  ];

  return (
    <SimplePageContainer>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Breadcrumbs items={breadcrumbItems} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="flex min-w-0 items-center gap-1.5 text-xl font-semibold text-gray-900">
              <span className="truncate">
                {subject.name}{" "}
                <span className="font-normal text-gray-500">
                  ({student.name}, {student.class_name})
                </span>
              </span>
              <Link
                href={`/tutor/subjects/${subjectId}`}
                title={t("viewSubjectButton")}
                aria-label={t("viewSubjectButton")}
                className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <BookOpen className="h-4 w-4" aria-hidden="true" />
              </Link>
            </h1>
            <span className="text-xs text-gray-500">{Math.round(percent)}%</span>
          </div>
          <ProgressBar percent={percent} compact colorful />
          {subject.teacher_name && (
            <p className="text-xs text-gray-500">
              {t("teacherLabel")}: {subject.teacher_name}
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
                  {topics.length === 0 ? (
                    <p className="text-sm text-gray-500">{t("noTopics")}</p>
                  ) : (
                    topics.map((topic) => (
                      <TopicSection
                        key={topic.id}
                        topic={topic}
                        lessons={lessonsByTopicId.get(topic.id) ?? []}
                        studentId={studentId}
                        assignmentByLessonId={assignmentByLessonId}
                        onAssignmentChanged={handleAssignmentChanged}
                      />
                    ))
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
