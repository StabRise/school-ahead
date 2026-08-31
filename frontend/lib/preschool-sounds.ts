"use client";

import { useEffect, useState } from "react";
import type { BalloonMode } from "@/stores/balloon-pop-game-store";

// Base names (no extension) of the recorded pronunciations available for a
// balloon-pop mode in public/preschool/<mode>/sounds/<label>.mp3 instead of
// relying on Piper TTS synthesis — the mode name doubles as the sounds
// folder name. Checked per file rather than just per folder so a mode with
// only partial coverage (e.g. a few items missing their recording) still
// gets TTS for the gaps instead of silence. Cached module-wide per mode
// (same convention as use-background-music.ts's tracksPromise) — drop new
// mp3s into a mode's public/preschool/<mode>/sounds folder and they're
// picked up automatically, no code change needed.
const namesCache = new Map<BalloonMode, Promise<Set<string>>>();

function fetchRecordedSoundNames(mode: BalloonMode): Promise<Set<string>> {
  let cached = namesCache.get(mode);
  if (!cached) {
    cached = fetch(`/api/preschool-sounds?mode=${encodeURIComponent(mode)}`)
      .then((res) => res.json())
      .then((data: { names: string[] }) => new Set(data.names))
      .catch(() => new Set<string>());
    namesCache.set(mode, cached);
  }
  return cached;
}

const EMPTY_NAMES: ReadonlySet<string> = new Set();

// Empty until the check resolves, so a mode's very first load briefly falls
// back to TTS for everything — cached after that, including across mode
// switches. `result` is tagged with the `mode` it answers for (rather than
// reset synchronously on every mode change) so a still-resolving check for a
// previous mode can't overwrite the new one's state once it lands late.
export function useRecordedSoundNames(mode: BalloonMode): ReadonlySet<string> {
  const [result, setResult] = useState<{ mode: BalloonMode; names: Set<string> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchRecordedSoundNames(mode).then((names) => {
      if (!cancelled) setResult({ mode, names });
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return result?.mode === mode ? result.names : EMPTY_NAMES;
}

// Plays the recorded pronunciation for `label` in `mode`'s sounds folder —
// e.g. "Bear" in "animals" plays /preschool/animals/sounds/Bear.mp3. Callers
// should only call this once useRecordedSoundNames(mode) confirms `label` is
// actually covered.
export function playRecordedSound(mode: BalloonMode, label: string): void {
  try {
    const audio = new Audio(`/preschool/${mode}/sounds/${encodeURIComponent(label)}.mp3`);
    void audio.play().catch(() => {
      // Best-effort only — autoplay restrictions, missing file, ...
    });
  } catch {
    // Best-effort only.
  }
}
