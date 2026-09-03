import { GamePlayPage } from "@/components/preschool/game-play-page";

export default async function StorySlugPage({ params }: { params: Promise<{ storySlug: string }> }) {
  const { storySlug } = await params;
  // Next.js hands this segment back still percent-encoded (e.g.
  // "%D0%9A%D0%BE..." for "Колобок") rather than decoded — decode it
  // explicitly rather than relying on that. Safe to call even if a future
  // Next.js version does decode it: decodeURIComponent on already-plain
  // text (no "%" sequences) is a no-op.
  return <GamePlayPage game="stories" storySlug={decodeURIComponent(storySlug)} />;
}
