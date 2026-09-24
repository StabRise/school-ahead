import type { SyllableOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { isVowel, toLetterUnits } from "./letters";
import { compareSyllables } from "./reading-game";

// Pure helpers for the "Слова" (Words) minigame — see words-game.tsx and
// docs/preschool/games/words.md.

export { isVowel };

// Never start or stand as a card of their own — see splitIntoReadingSegments.
const ATTACHING_MARKS = new Set(["ь", "Ь", "'", "’", "ʼ"]);

// Breaks a word into the same "{ во - в - к }"-style segments the "Казки"
// stories are written with (.claude/skills/stories-game-content/SKILL.md,
// "The syllable-splitting algorithm"): each vowel pairs with the one
// consonant right before it; any other consonants stand alone; a soft
// sign/apostrophe rides along with the consonant before it, and a Polish
// digraph (rz, sz, cz, ch — see letters.ts) is one consonant.
//   вовк -> во, в, к · лисичка -> ли, си, ч, ка · morze -> mo, rze
export function splitIntoReadingSegments(word: string): string[] {
  const segments: string[] = [];
  let buffer: string[] = [];
  for (const letter of toLetterUnits(word.trim())) {
    if (ATTACHING_MARKS.has(letter)) {
      if (buffer.length > 0) buffer[buffer.length - 1] += letter;
      else if (segments.length > 0) segments[segments.length - 1] += letter;
      continue;
    }
    if (isVowel(letter)) {
      const last = buffer.pop();
      segments.push(...buffer, `${last ?? ""}${letter}`);
      buffer = [];
      continue;
    }
    // Hyphens/spaces in a multi-word card just end the current run.
    if (!/\p{L}/u.test(letter)) {
      segments.push(...buffer);
      buffer = [];
      continue;
    }
    buffer.push(letter);
  }
  segments.push(...buffer);
  return segments;
}

export interface WordsGameCard {
  id: number;
  syllable: string; // e.g. "МА"
  word: string;
  image: string;
  syllableAudio: string | null;
  wordAudio: string | null;
}

// A letter's playable cards (a picture is required — it's the middle of
// the screen), in the "Склади" game's vowel order (МА, МО, МУ, ...), then
// by word.
export function toWordsGameCards(rows: SyllableOut[], language: string): WordsGameCard[] {
  return rows
    .filter((row): row is SyllableOut & { icon: string } => Boolean(row.icon))
    .map((row) => ({
      id: row.id,
      syllable: `${row.first_letter}${row.second_part}`.toLocaleUpperCase(language),
      word: row.word,
      image: row.icon,
      syllableAudio: row.syllable_audio,
      wordAudio: row.word_audio,
    }))
    .sort((a, b) => compareSyllables(a.syllable, b.syllable) || a.word.localeCompare(b.word, language));
}

// How a syllable is shown on screen: a capital first letter, the rest
// lowercase — "МА" -> "Ма", "MO" -> "Mo" — the way primers write them.
export function syllableForDisplay(syllable: string, language: string): string {
  const [first = "", ...rest] = [...syllable];
  return first.toLocaleUpperCase(language) + rest.join("").toLocaleLowerCase(language);
}

// Every this-many cards looked at award a Diamond (backend accounts.
// services.award_words_game_diamond).
export const WORDS_GAME_DIAMOND_THRESHOLD = 30;
