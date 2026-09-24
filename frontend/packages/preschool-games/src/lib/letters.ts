// Letter classification shared by every syllable splitter/colorer in the
// preschool games (jumping-frogs-game.ts's splitUkrainianSyllables — also
// the story editor's "format as cards" — and words-game.ts's
// splitIntoReadingSegments / syllable-card.tsx's letter colors). Covers the
// languages a reading.Syllable card or a story can be in: Ukrainian, plus
// English/Polish/Spanish.

// Ukrainian vowels, plus the Latin ones English/Polish/Spanish use (Y
// counts as one — it is in Polish, and a word-final English/Spanish "y"
// reads as one for a beginner).
const VOWELS = new Set([..."АОУЕИІЯЮЄЇ", ..."AEIOUY", ..."ĄĘÓ", ..."ÁÉÍÚÜ"]);

// Polish letter pairs that are one sound — read, split and colored as a
// single consonant ("morze" -> mo - rze, not mo - r - ze).
const DIGRAPHS = ["rz", "sz", "cz", "ch"];

export function isVowel(letter: string): boolean {
  return VOWELS.has(letter.toLocaleUpperCase());
}

// Any other letter (Cyrillic or Latin) — or a digraph unit from
// toLetterUnits — is a consonant; ь/apostrophes/punctuation are neither.
export function isConsonant(unit: string): boolean {
  return /^\p{L}+$/u.test(unit) && !isVowel(unit) && !isSoftSign(unit);
}

export function isSoftSign(letter: string): boolean {
  return letter === "ь" || letter === "Ь";
}

// The word's letters, with each digraph (any case, e.g. "Rz", "SZ") kept
// together as one unit.
export function toLetterUnits(word: string): string[] {
  const letters = [...word];
  const units: string[] = [];
  for (let i = 0; i < letters.length; i++) {
    const pair = letters[i] + (letters[i + 1] ?? "");
    if (DIGRAPHS.includes(pair.toLowerCase())) {
      units.push(pair);
      i += 1;
    } else {
      units.push(letters[i]);
    }
  }
  return units;
}

// Polish (Latin) "i" between a consonant and a vowel only softens the
// consonant — "mia", "nie", "sie" — so the consonant, the "i" and the vowel
// read (and split) as one card: "mial" -> mia - l. Ukrainian "і" is never
// this: it's always its own vowel ("ліана" -> лі - а - на).
export function isSofteningI(unit: string, next: string | undefined): boolean {
  return (unit === "i" || unit === "I") && next !== undefined && isVowel(next);
}
