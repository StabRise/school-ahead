import { TutorLessonDetailPage } from "@/components/tutor/tutor-lesson-detail-page";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <TutorLessonDetailPage lessonId={Number(lessonId)} />;
}
