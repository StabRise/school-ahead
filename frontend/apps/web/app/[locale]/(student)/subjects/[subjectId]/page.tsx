import { SubjectDetailPage } from "@/components/subjects/subject-detail-page";

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  return <SubjectDetailPage subjectId={Number(subjectId)} />;
}
