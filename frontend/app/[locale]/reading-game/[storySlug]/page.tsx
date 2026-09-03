import { PublicReadingGamePage } from "@/components/preschool/public-reading-game-page";

export default async function ReadingGameStoryPage({ params }: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await params;
  // Next.js hands this segment back still percent-encoded (see the
  // equivalent /games/stories/[storySlug]/page.tsx) — decode it explicitly
  // rather than relying on that.
  return <PublicReadingGamePage storySlug={decodeURIComponent(storySlug)} />;
}
