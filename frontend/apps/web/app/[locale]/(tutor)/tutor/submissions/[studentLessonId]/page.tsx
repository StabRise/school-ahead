import { SubmissionReview } from "@/components/tutor/submission-review";

export default async function TutorSubmissionPage({
  params,
}: {
  params: Promise<{ studentLessonId: string }>;
}) {
  const { studentLessonId } = await params;
  return <SubmissionReview studentLessonId={Number(studentLessonId)} />;
}
