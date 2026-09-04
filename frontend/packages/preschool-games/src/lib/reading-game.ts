"use client";

import { useEffect, useState } from "react";

export interface ReadingGameCard {
  key: string; // the word, e.g. "Мед"
  image: string;
  syllable: string; // e.g. "МЕ"
  // A recorded pronunciation of the word (<Word>.mp3 next to the image), if
  // one exists — see playCardSound, preferred over TTS whenever present.
  sound: string | null;
}

// Recorded pronunciation of a bare syllable (e.g. "МА" -> a URL for
// .../Ма.mp3), keyed by the same uppercased syllable string ReadingGameCard.
// syllable uses — see playSyllableSound.
export type ReadingGameSyllableSounds = Record<string, string>;

// Plays an audio URL and resolves once it's done (or has failed) — lets a
// caller chain a syllable's recording into the word's the same way it
// chains speakSequence([syllable]) into TTS for the word (see
// components/preschool/reading-game.tsx's handleMatch).
function playAudioUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(url);
      const finish = () => resolve();
      audio.addEventListener("ended", finish, { once: true });
      audio.addEventListener("error", finish, { once: true });
      void audio.play().catch(finish);
    } catch {
      resolve();
    }
  });
}

// Plays a card's recorded pronunciation. Best-effort, same pattern as
// lib/preschool-sounds.ts's playRecordedSound — callers should only call
// this once card.sound confirms a recording exists.
export function playCardSound(card: ReadingGameCard): Promise<void> {
  return card.sound ? playAudioUrl(card.sound) : Promise.resolve();
}

// Plays `syllable`'s recorded pronunciation if `syllableSounds` has one —
// callers should only call this once that's confirmed (mirrors
// playCardSound's contract for card.sound).
export function playSyllableSound(syllableSounds: ReadingGameSyllableSounds, syllable: string): Promise<void> {
  const url = syllableSounds[syllable];
  return url ? playAudioUrl(url) : Promise.resolve();
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

interface ReadingGameLevelData {
  cards: ReadingGameCard[];
  syllableSounds: ReadingGameSyllableSounds;
}

const EMPTY_LEVEL_DATA: ReadingGameLevelData = { cards: [], syllableSounds: {} };

const levelDataCache = new Map<string, Promise<ReadingGameLevelData>>();

function fetchLevelData(consonant: string): Promise<ReadingGameLevelData> {
  let cached = levelDataCache.get(consonant);
  if (!cached) {
    cached = fetch(`/api/reading-game-mode?folder=${encodeURIComponent(consonant)}`)
      .then((res) => res.json())
      .catch(() => EMPTY_LEVEL_DATA);
    levelDataCache.set(consonant, cached);
  }
  return cached;
}

// Every picture card for one consonant level, plus any syllable-level
// recordings (see ReadingGameModeResponse.syllableSounds), cached module-
// wide. Returns the empty defaults while `consonant` itself is still
// loading (including right after it changes) rather than briefly returning
// the previous consonant's data.
export function useReadingGameLevel(consonant: string): ReadingGameLevelData {
  const [loaded, setLoaded] = useState<{ consonant: string; data: ReadingGameLevelData }>({
    consonant: "",
    data: EMPTY_LEVEL_DATA,
  });

  useEffect(() => {
    let cancelled = false;
    void fetchLevelData(consonant).then((result) => {
      if (!cancelled) setLoaded({ consonant, data: result });
    });
    return () => {
      cancelled = true;
    };
  }, [consonant]);

  return loaded.consonant === consonant ? loaded.data : EMPTY_LEVEL_DATA;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Groups `cards` by syllable and returns the syllables in vowel order,
// capped to the first `syllableCount` of them (the level's "how many
// syllables" setting) — the picture cards to actually play with are every
// card whose syllable made the cut, so a syllable with several matching
// words can contribute more than one, up to `round(syllableCount * 1.5)`
// cards total (fewer if that many simply aren't available). Every active
// syllable keeps at least one card; which of the rest fill the remaining
// budget is picked at random so a level with more pictures than the cap
// isn't always the same subset.
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
  const available = cards.filter((card) => activeSyllables.has(card.syllable));

  const maxCards = Math.round(syllableCount * 1.5);
  if (available.length <= maxCards) return { syllables, cards: available };

  const guaranteed: ReadingGameCard[] = [];
  const leftover: ReadingGameCard[] = [];
  for (const syllable of syllables) {
    const [first, ...rest] = shuffle(bySyllable.get(syllable) ?? []);
    if (first) guaranteed.push(first);
    leftover.push(...rest);
  }
  const extras = shuffle(leftover).slice(0, Math.max(0, maxCards - guaranteed.length));
  const selected = new Set([...guaranteed, ...extras]);
  // Filter `available` (already in its original, stable order) rather than
  // concatenating guaranteed+extras, so the tray's layout doesn't jump
  // around between an under-cap and over-cap syllableCount.
  return { syllables, cards: available.filter((card) => selected.has(card)) };
}
