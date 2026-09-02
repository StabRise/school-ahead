"use client";

import { useEffect, useState } from "react";

export interface ReadingGameCard {
  key: string; // the word, e.g. "Мед"
  image: string;
  syllable: string; // e.g. "МЕ"
}

// The order syllables are introduced in as the level's syllable-count
// setting grows (docs/preschool/games/reading/README.md §3: "додаються в
// порядку голосної"). A syllable whose vowel isn't in this list (shouldn't
// happen for real Ukrainian consonant+vowel syllables) sorts after every
// listed one.
const VOWEL_ORDER = ["А", "О", "У", "Е", "И", "І", "Я", "Ю", "Є"];

function vowelRank(syllable: string): number {
  const vowel = syllable[1];
  const index = VOWEL_ORDER.indexOf(vowel);
  return index === -1 ? VOWEL_ORDER.length : index;
}

export function compareSyllables(a: string, b: string): number {
  return vowelRank(a) - vowelRank(b) || a.localeCompare(b, "uk");
}

// The pedagogical consonant order the reading minigame introduces levels in
// (docs/preschool/games/reading/README.md §3: "спочатку М Т Б С К Л В Г Р Н
// П а далі всі інші приголосні укр мови") — used both for the level (mode)
// picker's ordering and for "next letter" once a level is cleared. A
// consonant not listed here (a folder added later) sorts alphabetically
// after every listed one.
const CONSONANT_ORDER = ["М", "Т", "Б", "С", "К", "Л", "В", "Г", "Р", "Н", "П"];

export function sortConsonants(consonants: string[]): string[] {
  return [...consonants].sort((a, b) => {
    const rankA = CONSONANT_ORDER.indexOf(a);
    const rankB = CONSONANT_ORDER.indexOf(b);
    if (rankA === -1 && rankB === -1) return a.localeCompare(b, "uk");
    if (rankA === -1) return 1;
    if (rankB === -1) return -1;
    return rankA - rankB;
  });
}

let consonantsPromise: Promise<string[]> | null = null;

function fetchConsonants(): Promise<string[]> {
  if (!consonantsPromise) {
    consonantsPromise = fetch("/api/reading-game-modes")
      .then((res) => res.json())
      .then((data: { consonants: string[] }) => data.consonants)
      .catch(() => []);
  }
  return consonantsPromise;
}

// The reading minigame's full consonant (level) list — every subfolder of
// public/static/reading-game, fetched once and cached module-wide. Empty
// until the fetch resolves.
export function useReadingGameConsonants(): string[] {
  const [consonants, setConsonants] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchConsonants().then((result) => {
      if (!cancelled) setConsonants(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return consonants;
}

const cardsCache = new Map<string, Promise<ReadingGameCard[]>>();

function fetchCards(consonant: string): Promise<ReadingGameCard[]> {
  let cached = cardsCache.get(consonant);
  if (!cached) {
    cached = fetch(`/api/reading-game-mode?folder=${encodeURIComponent(consonant)}`)
      .then((res) => res.json())
      .then((data: { cards: ReadingGameCard[] }) => data.cards)
      .catch(() => []);
    cardsCache.set(consonant, cached);
  }
  return cached;
}

// Every picture card for one consonant level, cached module-wide. Returns
// [] while `consonant` itself is still loading (including right after it
// changes) rather than briefly returning the previous consonant's cards.
export function useReadingGameCards(consonant: string): ReadingGameCard[] {
  const [loaded, setLoaded] = useState<{ consonant: string; cards: ReadingGameCard[] }>({
    consonant: "",
    cards: [],
  });

  useEffect(() => {
    let cancelled = false;
    void fetchCards(consonant).then((result) => {
      if (!cancelled) setLoaded({ consonant, cards: result });
    });
    return () => {
      cancelled = true;
    };
  }, [consonant]);

  return loaded.consonant === consonant ? loaded.cards : [];
}

// Groups `cards` by syllable and returns the syllables in vowel order,
// capped to the first `syllableCount` of them (the level's "how many
// syllables" setting) — the picture cards to actually play with are every
// card whose syllable made the cut, which is why the tray can hold more
// cards than syllables (a syllable with two matching words keeps both).
export function selectLevel(
  cards: ReadingGameCard[],
  syllableCount: number,
): { syllables: string[]; cards: ReadingGameCard[] } {
  const bySyllable = new Map<string, ReadingGameCard[]>();
  for (const card of cards) {
    const group = bySyllable.get(card.syllable);
    if (group) group.push(card);
    else bySyllable.set(card.syllable, [card]);
  }
  const syllables = Array.from(bySyllable.keys()).sort(compareSyllables).slice(0, Math.max(0, syllableCount));
  const activeSyllables = new Set(syllables);
  return { syllables, cards: cards.filter((card) => activeSyllables.has(card.syllable)) };
}
