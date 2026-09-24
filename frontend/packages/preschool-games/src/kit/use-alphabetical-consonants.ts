"use client";

import { useEffect, useState } from "react";

// Every consonant/letter picker across the preschool games (jumping-frogs,
// reading a.k.a. /games/syllables, cards a.k.a. /games/syllables2) lists its
// options in plain Ukrainian alphabetical (abetka) order — no pedagogical
// progression baked in, so "next letter" and the settings dropdown agree.
// `path` is the game's own "list of consonants" API route (e.g.
// "/api/reading-game-modes", "/api/cards-game-modes"), each fetched once and
// cached module-wide. `sortLocale` is the letters' alphabet (the reading
// game's language setting; Ukrainian elsewhere).
const consonantsCache = new Map<string, Promise<string[]>>();

function fetchConsonants(path: string): Promise<string[]> {
  let cached = consonantsCache.get(path);
  if (!cached) {
    cached = fetch(path)
      .then((res) => res.json())
      .then((data: { consonants: string[] }) => data.consonants)
      .catch(() => []);
    consonantsCache.set(path, cached);
  }
  return cached;
}

export function useAlphabeticalConsonants(path: string, sortLocale = "uk"): string[] {
  const [consonants, setConsonants] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchConsonants(path).then((result) => {
      if (!cancelled) setConsonants([...result].sort((a, b) => a.localeCompare(b, sortLocale)));
    });
    return () => {
      cancelled = true;
    };
  }, [path, sortLocale]);

  return consonants;
}
