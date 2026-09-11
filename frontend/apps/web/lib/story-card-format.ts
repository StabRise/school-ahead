import { splitUkrainianSyllables } from "@school-ahead/preschool-games/syllables";

// "Format as card" toolbar action (components/tutor/story-markdown-editor.tsx)
// — turns a selected word (or several space-separated words) into the same
// consonant+vowel/м'який знак "{...}" card breakdown the reading minigame
// itself uses (see lib/jumping-frogs-game.ts's splitUkrainianSyllables,
// reused here rather than re-implemented), e.g. "яблуко" -> "{я-б-лу-ко}".
// Each word gets its own "{...}" group; runs of whitespace between words
// are preserved untouched.
export function formatSelectionAsCards(selection: string): string {
  return selection
    .split(/(\s+)/)
    .map((chunk) => (/^\s*$/.test(chunk) ? chunk : `{${splitUkrainianSyllables(chunk).join("-")}}`))
    .join("");
}
