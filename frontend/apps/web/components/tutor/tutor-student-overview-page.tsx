"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetTutorStudent, useMarkTutorStudentLessonComplete } from "@school-ahead/api-client/browser/tutor/tutor";
import {
  getGetTutorStudentBacklogQueryKey,
  getGetTutorStudentCalendarQueryKey,
  useGetTutorStudentBacklog,
  useGetTutorStudentCalendar,
} from "@school-ahead/api-client/browser/schedule/schedule";
import { AvatarBadge, type AvatarLayer } from "@school-ahead/avatar";
import type { TutorStudentOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { SimplePageContainer } from "@/components/simple/page-container";
import { ProgressBar } from "@/components/progress-bar";
import { SimpleCalendar } from "@/components/calendar/simple-calendar";
import { mergeSimpleRows, SimpleLessonTable } from "@/components/simple-lesson-table";
import { SubjectProgressList } from "@/components/subject-progress-list";
import { Tabs } from "@/components/tabs";
import { isoOf, todayIso } from "@/lib/dates";

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const weekday = result.getDay();
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
  result.setDate(result.getDate() + diffToMonday);
  result.setHours(0, 0, 0, 0);
  return result;
}

// Same body -> clothing -> headwear -> accessory stack useEquippedAvatarLayers
// builds from the signed-in user's own auth-store fields (see
// @school-ahead/avatar's equipped-avatar.tsx) — sourced here from the
// viewed student's TutorStudentOut instead, since this student isn't the
// signed-in tutor.
function equippedLayersFromStudent(student: TutorStudentOut): AvatarLayer[] {
  const items = [
    ...(student.equipped_clothing_items ?? []),
    ...(student.equipped_headwear_items ?? []),
    ...(student.equipped_accessory_items ?? []),
  ];
  return [
    ...(student.equipped_avatar?.image
      ? [
          {
            itemId: null,
            image: student.equipped_avatar.image,
            scale: student.equipped_avatar.scale ?? 1,
            offsetX: 0,
            offsetY: 0,
            rotation: 0,
          },
        ]
      : []),
    ...items
      .filter((item) => item.image)
      .map((item) => ({
        itemId: item.id,
        image: item.image as string,
        scale: item.scale ?? 1,
        offsetX: item.offset_x ?? 0,
        offsetY: item.offset_y ?? 0,
        rotation: item.rotation ?? 0,
      })),
  ];
}

// Landing page for the "today" link on the day-name in a student's calendar
// column (components/calendar/simple-calendar.tsx) when viewed by their
// tutor — a compact stand-in for the student's own dashboard: who they are,
// their equipped avatar, and three tabs mirroring that dashboard's own
// sections (today's lessons, the full calendar, per-subject progress).
export function TutorStudentOverviewPage({
  studentId,
  activeTab = "today",
}: {
  studentId: number;
  activeTab?: "today" | "calendar" | "stats";
}) {
  const t = useTranslations("TutorStudentOverview");
  const studentQuery = useGetTutorStudent(studentId);
  const queryClient = useQueryClient();
  const markComplete = useMarkTutorStudentLessonComplete();
  const [markingCompleteId, setMarkingCompleteId] = useState<number | undefined>(undefined);

  const todayKey = useMemo(() => todayIso(), []);
  const weekStartKey = useMemo(() => isoOf(startOfWeek(new Date())), []);
  const calendarQuery = useGetTutorStudentCalendar(studentId, { week_start: weekStartKey });
  const backlogQuery = useGetTutorStudentBacklog(studentId);

  // "Позначити виконаним" on a today/backlog row — lets a tutor mark a
  // lesson done directly (e.g. one actually finished in person, off-
  // platform) without needing the student to submit/confirm it themself.
  // See backend's mark_student_lesson_complete, which accepts any status
  // (unlike grade(), restricted to PendingReview submissions).
  const handleMarkComplete = (item: { id: number }) => {
    setMarkingCompleteId(item.id);
    markComplete.mutate(
      { studentLessonId: item.id },
      {
        onSettled: () => setMarkingCompleteId(undefined),
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTutorStudentCalendarQueryKey(studentId) });
          queryClient.invalidateQueries({ queryKey: getGetTutorStudentBacklogQueryKey(studentId) });
        },
      },
    );
  };

  // Same "today + still-open backlog" merge the student's own dashboard
  // renders (components/student-dashboard.tsx -> SimpleDashboard) — a
  // lesson overdue from an earlier day belongs here too, not just what's
  // scheduled for today, so the tutor sees exactly what the student sees.
  const todayLessons = useMemo(
    () => (calendarQuery.data ?? []).filter((item) => item.scheduled_date === todayKey),
    [calendarQuery.data, todayKey],
  );
  const rows = useMemo(
    () => mergeSimpleRows(todayLessons, backlogQuery.data ?? []),
    [todayLessons, backlogQuery.data],
  );

  const isLessonsLoading = calendarQuery.isLoading || backlogQuery.isLoading;
  const isLessonsError = calendarQuery.isError || backlogQuery.isError;

  if (studentQuery.isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (studentQuery.isError || !studentQuery.data) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  const student = studentQuery.data;
  const layers = equippedLayersFromStudent(student);
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("breadcrumbMyClasses"), href: "/tutor/classes" },
    { label: student.class_name, href: `/tutor/classes/${student.class_id}` },
    { label: student.name },
  ];

  return (
    <SimplePageContainer>
      <div className="flex flex-col gap-6">
        <Breadcrumbs items={breadcrumbItems} />

        <div className="flex flex-wrap items-center gap-6">
          <AvatarBadge
            layers={layers}
            className="h-28 w-28 shrink-0"
            padding="p-3"
            fallback={
              student.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={student.avatar_url} alt="" className="h-28 w-28 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-300">
                  <User className="h-10 w-10" aria-hidden="true" />
                </div>
              )
            }
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 className="text-xl font-semibold text-gray-900">{student.name}</h1>
            <p className="text-sm text-gray-500">{student.class_name}</p>
            <ProgressBar percent={student.completed_percent} label={t("completedLabel")} colorful />
          </div>
        </div>

        <Tabs
          value={activeTab}
          tabs={[
            {
              value: "today",
              label: t("todayTitle"),
              href: `/tutor/students/${studentId}`,
              content: (
                <>
                  {isLessonsLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
                  {isLessonsError && <p className="text-sm text-red-600">{t("error")}</p>}
                  {!isLessonsLoading && !isLessonsError && (
                    <SimpleLessonTable
                      rows={rows}
                      emptyMessage={t("noLessonsToday")}
                      colorful
                      hrefFor={(item) => `/tutor/lessons/${item.lesson_id}`}
                      onMarkComplete={handleMarkComplete}
                      markingCompleteId={markingCompleteId}
                    />
                  )}
                </>
              ),
            },
            {
              value: "calendar",
              label: t("calendarTab"),
              href: `/tutor/students/${studentId}/calendar`,
              content: <SimpleCalendar studentId={studentId} colorful bare />,
            },
            {
              value: "stats",
              label: t("statsTab"),
              href: `/tutor/students/${studentId}/stats`,
              content: <SubjectProgressList studentId={studentId} colorful />,
            },
          ]}
        />
      </div>
    </SimplePageContainer>
  );
}
