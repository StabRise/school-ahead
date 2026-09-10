// Shared "is this selection short enough to save as a personal dictionary
// entry" rule — read-along-content.tsx and translatable-content.tsx both
// gate their "add to dictionary" button on it.
export const DICTIONARY_MAX_WORDS = 5;

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
