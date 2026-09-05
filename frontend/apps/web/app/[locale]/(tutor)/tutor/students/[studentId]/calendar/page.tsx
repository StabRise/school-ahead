import { TutorStudentOverviewPage } from "@/components/tutor/tutor-student-overview-page";

export default async function StudentCalendarPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  return <TutorStudentOverviewPage studentId={Number(studentId)} activeTab="calendar" />;
}
