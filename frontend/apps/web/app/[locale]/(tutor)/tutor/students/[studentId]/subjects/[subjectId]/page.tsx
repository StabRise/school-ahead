import { TutorStudentSubjectPage } from "@/components/tutor/tutor-student-subject-page";

export default async function StudentSubjectPage({
  params,
}: {
  params: Promise<{ studentId: string; subjectId: string }>;
}) {
  const { studentId, subjectId } = await params;
  return <TutorStudentSubjectPage subjectId={Number(subjectId)} studentId={Number(studentId)} />;
}
