import { StoryEditorPage } from "@/components/tutor/story-editor-page";

export default async function StoryPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  return <StoryEditorPage storyId={Number(storyId)} />;
}
