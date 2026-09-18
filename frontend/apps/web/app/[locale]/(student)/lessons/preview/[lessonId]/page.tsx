import { LessonPreviewPage } from "@/components/subjects/lesson-preview-page";

export default async function LessonPreview({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <LessonPreviewPage lessonId={Number(lessonId)} />;
}
