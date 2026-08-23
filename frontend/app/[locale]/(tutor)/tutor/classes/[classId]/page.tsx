import { TutorClassDetailPage } from "@/components/tutor/tutor-class-detail-page";

export default async function ClassPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  return <TutorClassDetailPage classId={Number(classId)} />;
}
