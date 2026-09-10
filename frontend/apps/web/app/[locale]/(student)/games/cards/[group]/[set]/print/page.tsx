import { FlashcardPrintPage } from "@school-ahead/flashcards";

export default async function CardsSetPrintRoutePage({
  params,
}: {
  params: Promise<{ group: string; set: string }>;
}) {
  const { group, set } = await params;
  // Next.js hands these segments back still percent-encoded (e.g. a folder
  // named "7 klasa") — decode explicitly rather than relying on that, same
  // as stories' [storySlug]/page.tsx.
  return <FlashcardPrintPage group={decodeURIComponent(group)} set={decodeURIComponent(set)} />;
}
