"use client";

import { useTranslations } from "next-intl";
import { useGetTutorStudent } from "@school-ahead/api-client/browser/tutor/tutor";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { SimpleCalendar } from "@/components/calendar/simple-calendar";

// "View calendar" link on the class detail page's student roster — a
// tutor-management view of one student's calendar (drag-to-reschedule,
// delete, add-day-lesson), reusing the same SimpleCalendar the student's
// own "Календар" page renders (see components/calendar/simple-calendar.tsx's
// `studentId` prop) — monochrome styling, same capabilities WeeklyCalendar
// gave tutors before this migration.
export function TutorStudentCalendarPage({ studentId }: { studentId: number }) {
  const t = useTranslations("TutorStudentCalendar");
  const studentQuery = useGetTutorStudent(studentId);

  if (studentQuery.isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (studentQuery.isError || !studentQuery.data) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  const student = studentQuery.data;
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("breadcrumbMyClasses"), href: "/tutor/classes" },
    { label: student.class_name, href: `/tutor/classes/${student.class_id}` },
    { label: student.name },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="mx-auto w-full max-w-6xl px-6 pt-6">
        <Breadcrumbs items={breadcrumbItems} />
      </div>
      <SimpleCalendar studentId={studentId} />
    </div>
  );
}
