import { StudentLessonView } from "@/components/lesson-wizard/student-lesson-view";

export default async function StudentLessonPage({
  params,
}: {
  params: Promise<{ studentLessonId: string }>;
}) {
  const { studentLessonId } = await params;
  return <StudentLessonView studentLessonId={Number(studentLessonId)} />;
}
