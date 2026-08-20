import { LessonWizard } from "@/components/lesson-wizard/lesson-wizard";

export default async function StudentLessonPage({
  params,
}: {
  params: Promise<{ studentLessonId: string }>;
}) {
  const { studentLessonId } = await params;
  return <LessonWizard studentLessonId={Number(studentLessonId)} />;
}
