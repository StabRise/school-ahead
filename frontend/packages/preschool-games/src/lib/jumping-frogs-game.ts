// Pure logic for the "Jumping Frogs" preschool minigame — see docs/
// preschool/games/jumping-frogs.md for the design brief. No React/DOM here,
// same testability contract as lib/reading-game.ts/lib/math-game.ts.

import type { ReadingGameCard } from "./reading-game";

const UK_VOWELS = new Set(["А", "О", "У", "Е", "И", "І", "Я", "Ю", "Є", "Ї"]);
const UK_CONSONANTS = new Set([
  "Б",
  "В",
  "Г",
  "Ґ",
  "Д",
  "Ж",
  "З",
  "Й",
  "К",
  "Л",
  "М",
  "Н",
  "П",
  "Р",
  "С",
  "Т",
  "Ф",
  "Х",
  "Ц",
  "Ч",
  "Ш",
  "Щ",
]);

function isVowelLetter(letter: string): boolean {
  return UK_VOWELS.has(letter.toLocaleUpperCase("uk"));
}

function isConsonantLetter(letter: string): boolean {
  return UK_CONSONANTS.has(letter.toLocaleUpperCase("uk"));
}

function isSoftSign(letter: string): boolean {
  return letter.toLocaleUpperCase("uk") === "Ь";
}

// Automatically groups a word into syllable "cards" the same way the brief's
// own worked examples do: a consonant immediately followed by a vowel
// merges into one two-letter group; anything else (a lone vowel, or a
// consonant not followed by a vowel — typically a word's final consonant,
// or two consonants in a row) stands alone as its own one-letter group. A
// soft sign (ь) is the one exception to "own group" — it always joins the
// card right before it instead, e.g. "Місяць" -> ["Мі", "ся", "ць"], not
// ["Мі", "ся", "ц", "ь"].
// Verified against every example in the brief:
//   "Мавпа"  -> ["Ма", "в", "па"]
//   "Яблуко" -> ["Я", "б", "лу", "ко"]
//   "Торт"   -> ["То", "р", "т"]
//   "Маяк"   -> ["Ма", "я", "к"]
//   "Місяць" -> ["Мі", "ся", "ць"]
// This is a simple pedagogical heuristic, not a real linguistic syllable
// splitter (it doesn't special-case digraphs, apostrophes, or clusters like
// "ЩО") — no example in the brief needs more than this.
export function splitUkrainianSyllables(word: string): string[] {
  const letters = [...word];
  const groups: string[] = [];
  let i = 0;
  while (i < letters.length) {
    const letter = letters[i];
    if (isSoftSign(letter) && groups.length > 0) {
      groups[groups.length - 1] += letter;
      i += 1;
      continue;
    }
    const next = letters[i + 1];
    if (next && isConsonantLetter(letter) && isVowelLetter(next)) {
      groups.push(letter + next);
      i += 2;
    } else {
      groups.push(letter);
      i += 1;
    }
  }
  return groups;
}

export interface JumpingFrogsRow {
  options: [ReadingGameCard, ReadingGameCard, ReadingGameCard];
  correctIndex: 0 | 1 | 2;
}

export interface JumpingFrogsLevelContent {
  target: ReadingGameCard;
  rows: JumpingFrogsRow[];
}

// The three reading-difficulty tiers a level can be built at: 1 = bare
// letters, 2 = open (consonant+vowel) syllables, 3 = whole words (the
// original/default game). All three share the exact same ROWS_PER_LEVEL,
// 3-option jump mechanic — only what a "card" *is* changes.
export type JumpingFrogsDifficulty = 1 | 2 | 3;

// "Щоб пройти рівень - потрібно проскочити 10 кувшинок" (docs/preschool/
// games/jumping-frogs.md §3) — this many lily-pad rows per level, 3 word
// choices (1 target + 2 distractors) per row.
export const ROWS_PER_LEVEL = 10;
const OPTIONS_PER_ROW = 3;

// The 6 "hard" vowels open syllables are conventionally first taught with
// (docs/preschool/games/reading/README.md §3's own pedagogical ordering,
// minus the iotated я/ю/є/ї saved for later) — level 2's syllable pool.
const OPEN_SYLLABLE_VOWELS = ["а", "о", "у", "е", "и", "і"];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Picks `count` distractors distinct from `target` where possible. A pool
// too thin to fill every row with distinct cards (fewer than `count + 1`
// total) samples with replacement instead of crashing — same graceful-
// degradation rule other games apply to a thin content pool.
function pickDistractors(pool: ReadingGameCard[], target: ReadingGameCard, count: number): ReadingGameCard[] {
  const candidates = pool.filter((card) => card.key !== target.key);
  if (candidates.length === 0) return Array.from({ length: count }, () => target);
  const shuffled = shuffle(candidates);
  return Array.from({ length: count }, (_, i) => shuffled[i % shuffled.length]);
}

// Builds ROWS_PER_LEVEL rows for a fixed `target`, each independently
// shuffling it in among 2 fresh distractors (drawn from `pool`, `target`
// included or not — pickDistractors excludes it either way) at a random
// position.
function buildRowsFor(target: ReadingGameCard, pool: ReadingGameCard[]): JumpingFrogsRow[] {
  return Array.from({ length: ROWS_PER_LEVEL }, () => {
    const distractors = pickDistractors(pool, target, OPTIONS_PER_ROW - 1);
    const correctIndex = Math.floor(Math.random() * OPTIONS_PER_ROW) as 0 | 1 | 2;
    let distractorIndex = 0;
    const options = Array.from({ length: OPTIONS_PER_ROW }, (_, slot) =>
      slot === correctIndex ? target : distractors[distractorIndex++],
    ) as [ReadingGameCard, ReadingGameCard, ReadingGameCard];
    return { options, correctIndex };
  });
}

// Picks a random target from `pool`, then builds ROWS_PER_LEVEL rows around it — used
// by every difficulty tier where "any card in the pool" is a fair target
// (levels 2 and 3; level 1 fixes its target to the chosen consonant
// instead, see buildLetterLevel).
function assembleLevel(pool: ReadingGameCard[]): JumpingFrogsLevelContent | null {
  if (pool.length === 0) return null;
  const target = pool[Math.floor(Math.random() * pool.length)];
  return { target, rows: buildRowsFor(target, pool) };
}

// A level-1/2 "card" has no real photo or recording (there's no asset for
// a bare letter or a synthesized syllable the way a whole word has one
// under public/static/letters) — TTS covers pronunciation (no `sound`),
// and TargetHeaderBar skips the image box entirely for an empty `image`.
function syntheticCard(key: string): ReadingGameCard {
  return { key, image: "", syllable: key.slice(0, 2).toLocaleUpperCase("uk"), sound: null };
}

// Level 3 (words) — a random target word from a consonant's card pool
// (shown fixed in the header for the whole level, per §2) and ROWS_PER_LEVEL
// rows, each independently reshuffled. Returns null for an empty pool (no
// words loaded yet, or a consonant folder with none).
export function buildLevel(cards: ReadingGameCard[]): JumpingFrogsLevelContent | null {
  return assembleLevel(cards);
}

// Level 1 ("просто букви") — the target is `consonant` itself; the other 2
// options each row are different letters from `pool` (every available
// consonant, e.g. from useReadingGameConsonants()). Returns null with no
// consonant chosen yet or an empty pool.
export function buildLetterLevel(consonant: string, pool: string[]): JumpingFrogsLevelContent | null {
  if (!consonant || pool.length === 0) return null;
  const target = syntheticCard(consonant);
  const cards = Array.from(new Set([consonant, ...pool])).map(syntheticCard);
  return { target, rows: buildRowsFor(target, cards) };
}

// Level 2 ("відкриті склади") — the target is one open (consonant+vowel)
// syllable of `consonant` (e.g. "Ма"); the other 2 options each row are the
// same consonant with a different vowel (e.g. "Мо", "Му") — same "one
// letter, different vowel" drill as the "Складами"/"Картки" games. Returns
// null with no consonant chosen yet.
export function buildSyllableLevel(consonant: string): JumpingFrogsLevelContent | null {
  if (!consonant) return null;
  const upperConsonant = consonant.charAt(0).toLocaleUpperCase("uk");
  const cards = OPEN_SYLLABLE_VOWELS.map((vowel) => syntheticCard(upperConsonant + vowel));
  return assembleLevel(cards);
}
