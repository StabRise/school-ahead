"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { User } from "lucide-react";
import { useGetTutorStudent, useListTutorStudentAchievements } from "@school-ahead/api-client/browser/tutor/tutor";
import { useGetTutorStudentBacklog, useGetTutorStudentCalendar } from "@school-ahead/api-client/browser/schedule/schedule";
import { EquippedAvatarLayers, type AvatarLayer } from "@school-ahead/preschool-ui";
import type { TutorStudentOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { SimplePageContainer } from "@/components/simple/page-container";
import { ProgressBar } from "@/components/progress-bar";
import { SimpleCalendar } from "@/components/calendar/simple-calendar";
import { mergeSimpleRows, SimpleLessonTable } from "@/components/simple-lesson-table";
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
// @school-ahead/preschool-ui's equipped-avatar.tsx) — sourced here from the
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

// "Статистика" tab — one progress bar per subject in the student's class,
// same shape as the student's own dashboard's collapsible stats section
// (components/simple-dashboard.tsx's SimpleSubjectStats), just fed from the
// tutor-scoped achievements endpoint instead of the self-scoped one.
function SubjectStatsTab({ studentId }: { studentId: number }) {
  const t = useTranslations("TutorStudentOverview");
  const { data, isLoading, isError } = useListTutorStudentAchievements(studentId);
  const subjects = data ?? [];

  if (isLoading) {
    return <p className="text-sm text-gray-500">{t("loading")}</p>;
  }
  if (isError) {
    return <p className="text-sm text-red-600">{t("error")}</p>;
  }
  if (subjects.length === 0) {
    return <p className="text-sm text-gray-500">{t("noSubjects")}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {subjects.map((subject) => (
        <li key={subject.subject_id}>
          <ProgressBar percent={subject.completed_percent} label={subject.subject_name} colorful />
        </li>
      ))}
    </ul>
  );
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

  const todayKey = useMemo(() => todayIso(), []);
  const weekStartKey = useMemo(() => isoOf(startOfWeek(new Date())), []);
  const calendarQuery = useGetTutorStudentCalendar(studentId, { week_start: weekStartKey });
  const backlogQuery = useGetTutorStudentBacklog(studentId);

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
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-gray-100 p-3">
            {layers.length > 0 ? (
              <EquippedAvatarLayers layers={layers} />
            ) : student.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={student.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-gray-300">
                <User className="h-10 w-10" aria-hidden="true" />
              </div>
            )}
          </div>
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
              content: <SubjectStatsTab studentId={studentId} />,
            },
          ]}
        />
      </div>
    </SimplePageContainer>
  );
}
