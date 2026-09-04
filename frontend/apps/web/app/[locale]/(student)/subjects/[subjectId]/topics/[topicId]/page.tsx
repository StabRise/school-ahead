import { TopicDetailPage } from "@/components/subjects/topic-detail-page";

export default async function TopicPage({
  params,
}: {
  params: Promise<{ subjectId: string; topicId: string }>;
}) {
  const { subjectId, topicId } = await params;
  return <TopicDetailPage subjectId={Number(subjectId)} topicId={Number(topicId)} />;
}
