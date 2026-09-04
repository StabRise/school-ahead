"use client";

import { useEffect, useState } from "react";

export interface PreschoolCard {
  // Canonical name — matches the image/sound filename it was discovered
  // from, regardless of language. Use this (not the translated display
  // text) for anything that must match a filename or a CSS value, like
  // "colors" mode's balloon fill.
  key: string;
  image?: string;
}

export interface PreschoolModeData {
  cards: PreschoolCard[];
  // Which of "en"/"uk"/"pl" have their own subfolder under this mode's
  // folder — empty means the mode hasn't opted into per-language content at
  // all, so it's treated as available for every language.
  availableLanguages: string[];
  // Per-language display-name override, from each language subfolder's
  // title.json — keyed by language, missing entries fall back to another
  // available language's title, then to the folder name itself.
  titles: Record<string, string>;
  // Per-language bonus-quiz question phrasing override, from title.json's
  // "quiz.question_format" — "{card}" is replaced with the card's display
  // name. Missing entries fall back to DEFAULT_QUESTION_FORMAT.
  quizFormats: Record<string, string>;
  // Per-language canonical-key -> translated-text map, from title.json's
  // "cards" — for a language with no recordings of its own, this is what a
  // card actually displays/speaks as (see resolveCard) instead of its
  // English canonical key.
  translations: Record<string, Record<string, string>>;
  // Per-language recorded-pronunciation coverage — `names` are canonical
  // keys with a recording under `soundsPath`, or soundsPath is null if this
  // language has no sounds folder at all (falls back to TTS for everything).
  sounds: Record<string, { names: string[]; soundsPath: string | null }>;
}

export const EMPTY_MODE_DATA: PreschoolModeData = {
  cards: [],
  availableLanguages: [],
  titles: {},
  quizFormats: {},
  translations: {},
  sounds: {},
};

let modesPromise: Promise<string[]> | null = null;

function fetchModes(): Promise<string[]> {
  if (!modesPromise) {
    modesPromise = fetch("/api/preschool-modes")
      .then((res) => res.json())
      .then((data: { modes: string[] }) => data.modes)
      .catch(() => []);
  }
  return modesPromise;
}

// The balloon-pop minigame's full mode list — every subfolder of
// public/preschool/balloon-game, fetched once and cached module-wide. Empty
// until the fetch resolves.
export function usePreschoolModes(): string[] {
  const [modes, setModes] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchModes().then((result) => {
      if (!cancelled) setModes(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return modes;
}

const modeDataCache = new Map<string, Promise<PreschoolModeData>>();

function fetchModeData(folder: string): Promise<PreschoolModeData> {
  let cached = modeDataCache.get(folder);
  if (!cached) {
    cached = fetch(`/api/preschool-mode?folder=${encodeURIComponent(folder)}`)
      .then((res) => res.json())
      .catch(() => EMPTY_MODE_DATA);
    modeDataCache.set(folder, cached);
  }
  return cached;
}

// Fetches, and caches module-wide, every mode's full data — cards, titles,
// quiz phrasing, translations, and sound coverage for every language at
// once (see PreschoolModeData) — so a language switch never needs a new
// request. `folders` should be a stable (module-level or otherwise
// identity-stable) array, since it drives the effect's dependency.
export function usePreschoolModeData(folders: string[]): Record<string, PreschoolModeData> {
  const [data, setData] = useState<Record<string, PreschoolModeData>>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.all(folders.map(async (folder) => [folder, await fetchModeData(folder)] as const)).then(
      (entries) => {
        if (!cancelled) setData(Object.fromEntries(entries));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [folders]);

  return data;
}

// A card's actual display/speech text for `language` — the translated word
// from title.json's "cards" map if this specific card has one, otherwise
// its canonical (English) key.
export function resolveCardName(card: PreschoolCard, language: string, modeData: PreschoolModeData): string {
  return modeData.translations[language]?.[card.key] ?? card.key;
}

// Plays the recorded pronunciation for canonical key `key` from
// `soundsPath` (see PreschoolModeData.sounds) — e.g. soundsPath
// "/static/balloon-game/animals/en/sounds" and key "Bear" plays
// /static/balloon-game/animals/en/sounds/Bear.mp3. Callers should only
// call this once that language's `sounds.names` confirms `key` is actually
// covered.
export function playRecordedSound(soundsPath: string, key: string): void {
  try {
    const audio = new Audio(`${soundsPath}/${encodeURIComponent(key)}.mp3`);
    void audio.play().catch(() => {
      // Best-effort only — autoplay restrictions, missing file, ...
    });
  } catch {
    // Best-effort only.
  }
}
