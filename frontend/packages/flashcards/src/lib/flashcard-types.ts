// Pure types + helpers for the "Cards" study flashcards game (docs/
// preschool/games/cards.md) — deliberately without "use client" so the
// /api/flashcard-* route handlers (server-only) can import them too;
// lib/flashcards.ts (the client fetch hooks) re-exports the types from
// here and stays "use client".

export interface FlashcardItem {
  id: number;
  term: string;
  translation?: string;
  image?: string;
  definition?: string;
  // A formula (e.g. "g ≈ 10 m/s² = 10 N/kg") — plain text, shown alongside
  // definition rather than through DefinitionMarkdown since it's not prose.
  formula?: string;
  // Relative path (resolved via flashcardSoundUrl) to a pre-recorded mp3 of
  // the term — played instead of TTS when present and reachable (see
  // lib/flashcard-speech.ts).
  sound?: string;
}

export interface FlashcardCategory {
  title: string;
  description?: string;
  items: FlashcardItem[];
}

export interface FlashcardSet {
  title: string;
  categories: FlashcardCategory[];
}

export interface FlashcardGroupSummary {
  slug: string;
  title: string;
}

export interface FlashcardSetSummary {
  slug: string;
  title: string;
  categoryCount: number;
  itemCount: number;
}

// A group's title.json may set a `language` (e.g.
// public/static/cards/fizyka/title.json: {"title": "Fizyka", "language":
// "pl"}) so every set under it defaults its TTS voice to that language
// instead of the game-wide "en" fallback — still just a default, overridden
// per group+set the moment a student picks a different one from the ⚙
// panel (see stores/flashcard-language-store.ts). Kept as its own union
// rather than importing @school-ahead/api-client's SpeechLanguage (a
// browser-oriented package) so this file stays importable from server route
// handlers; the literal values are the same set, so a FlashcardLanguage
// value type-checks wherever a SpeechLanguage is expected.
export const FLASHCARD_LANGUAGES = ["en", "uk", "pl", "es"] as const;
export type FlashcardLanguage = (typeof FLASHCARD_LANGUAGES)[number];

export function isFlashcardLanguage(value: unknown): value is FlashcardLanguage {
  return typeof value === "string" && (FLASHCARD_LANGUAGES as readonly string[]).includes(value);
}

// A folder name (group or set) is used as-is from the filesystem — reject
// anything that could escape the intended directory once interpolated into
// a path (path separators, "..", a leading "."), same rule as
// app/api/story/route.ts's isValidSlug. Otherwise deliberately permissive
// (a slug is just whatever a folder is named, e.g. "7 klasa").
const INVALID_SLUG_RE = /[/\\]/;

export function isValidFlashcardSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 200 && !INVALID_SLUG_RE.test(slug) && slug !== "." && slug !== "..";
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

// A card asset (image or sound) is either a link from the internet (used
// as-is) or a path relative to its own set folder (e.g. "img/potęga.jpeg")
// — resolved segment-by-segment so a subfolder like "img/" stays a real
// path separator instead of being percent-encoded away.
function resolveRelativeCardAssetUrl(group: string, set: string, relativePath: string): string {
  if (isAbsoluteUrl(relativePath)) return relativePath;
  const encodedPath = relativePath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `/static/cards/${encodeURIComponent(group)}/${encodeURIComponent(set)}/${encodedPath}`;
}

export function flashcardImageUrl(group: string, set: string, image: string): string {
  return resolveRelativeCardAssetUrl(group, set, image);
}

// A card's pre-recorded pronunciation (see FlashcardItem.sound) — same
// resolution rules as flashcardImageUrl, since both live next to set.json.
export function flashcardSoundUrl(group: string, set: string, sound: string): string {
  return resolveRelativeCardAssetUrl(group, set, sound);
}
