import { TutorSubjectDetailPage } from "@/components/tutor/tutor-subject-detail-page";

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  return <TutorSubjectDetailPage subjectId={Number(subjectId)} />;
}
