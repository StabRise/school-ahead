import type { FlashcardItem } from "@/lib/flashcard-types";

// Which fields (docs/preschool/games/cards.md's term/translation/image/
// definition) a flashcard's front and back show — independently
// configurable per side via GameSettingsPanel, shared by both game
// modes (FlipCard's two faces in "Навчання", the question/option cards in
// "Тест").
export type CardField = "term" | "translation" | "image" | "definition";

export const CARD_FIELDS: CardField[] = ["term", "translation", "image", "definition"];

export type CardFaceConfig = Record<CardField, boolean>;

// Which axis FlipCard's 3D flip rotates around, in "Навчання" (docs/
// preschool/games/cards.md) — "vertical" (the original) spins around a
// vertical line through the card's middle, like a page turning
// left/right; "horizontal" spins around a horizontal line, top/bottom.
// Persisted (stores/flashcards-store.ts), same as frontConfig/backConfig.
export type CardFlipOrientation = "vertical" | "horizontal";

// Front: what you're quizzed on (term + its picture, no answer visible).
// Back: the answer (translation + definition) — same "both" default the
// game shipped with before this became configurable.
export const DEFAULT_FRONT_CONFIG: CardFaceConfig = { term: true, translation: false, image: true, definition: false };
export const DEFAULT_BACK_CONFIG: CardFaceConfig = { term: false, translation: true, image: false, definition: true };

function isCardFieldAvailable(item: FlashcardItem, hasImage: boolean, field: CardField): boolean {
  if (field === "term") return true;
  if (field === "translation") return Boolean(item.translation);
  if (field === "definition") return Boolean(item.definition);
  return hasImage;
}

// Which fields a face actually shows for one card: the configured fields
// this card has data for, or — if the student's configured face has
// nothing this card can show (e.g. "translation" checked but this card has
// none) — every field it does have, same graceful-degradation rule the
// game applies to a missing image. Shared by CardFaceContent (the
// interactive game) and FlashcardPrintSheet (the printable PDF), so the
// two stay in sync about what a face renders.
export function resolveVisibleCardFields(item: FlashcardItem, hasImage: boolean, config: CardFaceConfig): CardField[] {
  const wanted = CARD_FIELDS.filter((field) => config[field]);
  const available = wanted.filter((field) => isCardFieldAvailable(item, hasImage, field));
  if (available.length > 0) return available;
  return CARD_FIELDS.filter((field) => isCardFieldAvailable(item, hasImage, field));
}
