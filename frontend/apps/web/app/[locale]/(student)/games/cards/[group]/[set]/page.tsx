import { FlashcardGamePage } from "@/components/flashcards/flashcard-game-page";

export default async function CardsSetRoutePage({
  params,
}: {
  params: Promise<{ group: string; set: string }>;
}) {
  const { group, set } = await params;
  // Next.js hands these segments back still percent-encoded (e.g. a folder
  // named "7 klasa") — decode explicitly rather than relying on that, same
  // as stories' [storySlug]/page.tsx.
  return <FlashcardGamePage group={decodeURIComponent(group)} set={decodeURIComponent(set)} />;
}
