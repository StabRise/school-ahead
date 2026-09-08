// Which fields (docs/preschool/games/cards.md's term/translation/image/
// definition) a flashcard's front and back show — independently
// configurable per side via CardFaceSettingsPanel, shared by both game
// modes (FlipCard's two faces in "Навчання", the question/option cards in
// "Тест").
export type CardField = "term" | "translation" | "image" | "definition";

export const CARD_FIELDS: CardField[] = ["term", "translation", "image", "definition"];

export type CardFaceConfig = Record<CardField, boolean>;

// Front: what you're quizzed on (term + its picture, no answer visible).
// Back: the answer (translation + definition) — same "both" default the
// game shipped with before this became configurable.
export const DEFAULT_FRONT_CONFIG: CardFaceConfig = { term: true, translation: false, image: true, definition: false };
export const DEFAULT_BACK_CONFIG: CardFaceConfig = { term: false, translation: true, image: false, definition: true };
