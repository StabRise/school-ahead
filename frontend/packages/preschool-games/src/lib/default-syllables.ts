"use client";

import { useEffect, useState } from "react";

export interface DefaultSyllableCard {
  image: string;
  word: string;
}

// Keyed by the uppercased two-letter syllable, e.g. "МО" -> Морква.
export type DefaultSyllablesMap = Map<string, DefaultSyllableCard>;

const EMPTY_MAP: DefaultSyllablesMap = new Map();

let cache: Promise<DefaultSyllablesMap> | null = null;

function fetchDefaultSyllables(): Promise<DefaultSyllablesMap> {
  if (!cache) {
    cache = fetch("/api/default-syllables")
      .then((res) => res.json())
      .then((data: { syllables: { syllable: string; image: string; word: string }[] }) => {
        const map: DefaultSyllablesMap = new Map();
        for (const row of data.syllables) map.set(row.syllable, { image: row.image, word: row.word });
        return map;
      })
      .catch(() => EMPTY_MAP);
    // A failed fetch shouldn't stick a rejected promise in the module-wide
    // cache forever — the next mount would just re-await a dead promise.
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

// Every syllable's default card (public/static/syllables' DB replacement),
// fetched once module-wide and reused by every WordSegmentCard instance —
// see lib/syllable-card.tsx.
export function useDefaultSyllables(): DefaultSyllablesMap {
  const [map, setMap] = useState<DefaultSyllablesMap>(EMPTY_MAP);

  useEffect(() => {
    let cancelled = false;
    void fetchDefaultSyllables().then((result) => {
      if (!cancelled) setMap(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return map;
}
