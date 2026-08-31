"use client";

import { useEffect, useState } from "react";

export interface PreschoolCard {
  name: string;
  image: string;
}

export interface PreschoolFolderData {
  // Cards discovered from the image files directly under
  // public/preschool/<folder> — see /api/preschool-cards.
  cards: PreschoolCard[];
  // Which of "en"/"uk"/"pl" have their own subfolder under <folder> — empty
  // means the folder hasn't opted into per-language content at all, so the
  // mode it backs is treated as available for every language.
  availableLanguages: string[];
  // Per-language display-name override, read from each language subfolder's
  // title.json — keyed by language, missing entries fall back to the
  // mode's regular next-intl translation.
  titles: Record<string, string>;
}

const EMPTY_FOLDER_DATA: PreschoolFolderData = { cards: [], availableLanguages: [], titles: {} };

const folderCache = new Map<string, Promise<PreschoolFolderData>>();

function fetchFolderData(folder: string): Promise<PreschoolFolderData> {
  let cached = folderCache.get(folder);
  if (!cached) {
    cached = fetch(`/api/preschool-cards?folder=${encodeURIComponent(folder)}`)
      .then((res) => res.json())
      .catch(() => EMPTY_FOLDER_DATA);
    folderCache.set(folder, cached);
  }
  return cached;
}

// Fetches, and caches module-wide, the card list / available-languages /
// title overrides for every folder in `folders` (the asset folder backing
// each picture-pool BalloonMode — see PICTURE_POOL_BY_MODE in
// balloon-pop-game.tsx). `folders` should be a stable (module-level
// constant) array, since it drives the effect's dependency.
export function usePreschoolFolders(folders: string[]): Record<string, PreschoolFolderData> {
  const [data, setData] = useState<Record<string, PreschoolFolderData>>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.all(folders.map(async (folder) => [folder, await fetchFolderData(folder)] as const)).then(
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

interface RecordedSounds {
  // Base names (no extension) with a recorded pronunciation available.
  names: ReadonlySet<string>;
  // URL folder the recordings live in (pass straight to playRecordedSound),
  // or null if this folder/language has no recordings at all.
  soundsPath: string | null;
}

const EMPTY_RECORDED_SOUNDS: RecordedSounds = { names: new Set(), soundsPath: null };

const soundsCache = new Map<string, Promise<RecordedSounds>>();

function fetchRecordedSounds(folder: string, language: string): Promise<RecordedSounds> {
  const key = `${folder}:${language}`;
  let cached = soundsCache.get(key);
  if (!cached) {
    cached = fetch(`/api/preschool-sounds?folder=${encodeURIComponent(folder)}&language=${encodeURIComponent(language)}`)
      .then((res) => res.json())
      .then((data: { names: string[]; soundsPath: string | null }) => ({
        names: new Set(data.names),
        soundsPath: data.soundsPath,
      }))
      .catch(() => EMPTY_RECORDED_SOUNDS);
    soundsCache.set(key, cached);
  }
  return cached;
}

// Empty until the check resolves, so a mode's very first load briefly falls
// back to TTS for everything — cached after that, including across
// folder/language switches. `result` is tagged with the key it answers for
// (rather than reset synchronously on every change) so a still-resolving
// check for a previous folder/language can't overwrite newer state once it
// lands late.
export function useRecordedSounds(folder: string, language: string): RecordedSounds {
  const key = `${folder}:${language}`;
  const [result, setResult] = useState<{ key: string; data: RecordedSounds } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchRecordedSounds(folder, language).then((data) => {
      if (!cancelled) setResult({ key, data });
    });
    return () => {
      cancelled = true;
    };
  }, [folder, language, key]);

  return result?.key === key ? result.data : EMPTY_RECORDED_SOUNDS;
}

// Plays the recorded pronunciation for `label` from `soundsPath` (as
// returned by useRecordedSounds) — e.g. soundsPath
// "/preschool/animals/en/sounds" and label "Bear" plays
// /preschool/animals/en/sounds/Bear.mp3. Callers should only call this once
// useRecordedSounds confirms `label` is actually covered.
export function playRecordedSound(soundsPath: string, label: string): void {
  try {
    const audio = new Audio(`${soundsPath}/${encodeURIComponent(label)}.mp3`);
    void audio.play().catch(() => {
      // Best-effort only — autoplay restrictions, missing file, ...
    });
  } catch {
    // Best-effort only.
  }
}
