import { TutorStudentCalendarPage } from "@/components/tutor/tutor-student-calendar-page";

export default async function StudentCalendarPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  return <TutorStudentCalendarPage studentId={Number(studentId)} />;
}
