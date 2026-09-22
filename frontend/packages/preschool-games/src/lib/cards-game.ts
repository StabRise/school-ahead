"use client";

import { useEffect, useState } from "react";
import { compareSyllables } from "./reading-game";

export interface CardsGameCard {
  syllable: string; // e.g. "МО" — the syllable's first_letter + second_part
  word: string; // e.g. "Морква"
  image: string;
  // Flags the one card per syllable Learning mode's fixed grid uses — a
  // syllable can have several (e.g. МО: Морква, Морозиво), see reading.
  // Syllable.is_default.
  isDefault: boolean;
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
        const sorted = [...result].sort((a, b) => compareSyllables(a.syllable, b.syllable));
        setLoaded({ consonant, cards: sorted });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [consonant]);

  return loaded.consonant === consonant ? loaded.cards : [];
}
