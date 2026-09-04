"use client";

import { useEffect, useState } from "react";
import { compareSyllables, sortConsonants } from "./reading-game";

export { sortConsonants };

export interface CardsGameCard {
  syllable: string; // e.g. "ба" — also the image's filename minus extension
  word: string; // e.g. "баран" — empty when the syllable has no illustration yet
  image: string;
}

let consonantsPromise: Promise<string[]> | null = null;

function fetchConsonants(): Promise<string[]> {
  if (!consonantsPromise) {
    consonantsPromise = fetch("/api/cards-game-modes")
      .then((res) => res.json())
      .then((data: { consonants: string[] }) => data.consonants)
      .catch(() => []);
  }
  return consonantsPromise;
}

// The "Cards" minigame's full consonant (level) list — every subfolder of
// public/static/syllables that's ready to play (see /api/cards-game-modes),
// fetched once and cached module-wide. Empty until the fetch resolves.
export function useCardsGameConsonants(): string[] {
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

const levelCardsCache = new Map<string, Promise<CardsGameCard[]>>();

function fetchLevelCards(consonant: string): Promise<CardsGameCard[]> {
  let cached = levelCardsCache.get(consonant);
  if (!cached) {
    cached = fetch(`/api/cards-game-mode?folder=${encodeURIComponent(consonant)}`)
      .then((res) => res.json())
      .then((data: { cards: CardsGameCard[] }) => data.cards)
      .catch(() => []);
    levelCardsCache.set(consonant, cached);
  }
  return cached;
}

// Every flashcard for one consonant level, sorted in the same vowel order
// the "Склади" reading game introduces syllables in (lib/reading-game.ts's
// compareSyllables) so both games read consonants+levels the same way.
// Returns empty while `consonant` itself is still loading (including right
// after it changes) rather than briefly returning the previous consonant's
// cards.
export function useCardsGameLevel(consonant: string): CardsGameCard[] {
  const [loaded, setLoaded] = useState<{ consonant: string; cards: CardsGameCard[] }>({
    consonant: "",
    cards: [],
  });

  useEffect(() => {
    let cancelled = false;
    void fetchLevelCards(consonant).then((result) => {
      if (!cancelled) {
        // compareSyllables expects uppercase syllables (lib/reading-game.ts
        // derives them from Title-Case words) — words.json's keys are
        // lowercase, so uppercase them just for the comparison.
        const sorted = [...result].sort((a, b) =>
          compareSyllables(a.syllable.toLocaleUpperCase("uk"), b.syllable.toLocaleUpperCase("uk")),
        );
        setLoaded({ consonant, cards: sorted });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [consonant]);

  return loaded.consonant === consonant ? loaded.cards : [];
}
