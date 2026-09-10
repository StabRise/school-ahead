import { FlashcardsSetsPage } from "@school-ahead/flashcards";

export default async function CardsGroupRoutePage({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  // Next.js hands this segment back still percent-encoded — decode it
  // explicitly rather than relying on that, same as stories'
  // [storySlug]/page.tsx.
  return <FlashcardsSetsPage group={decodeURIComponent(group)} />;
}
