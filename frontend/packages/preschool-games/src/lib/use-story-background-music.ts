"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameMusicStore } from "../stores/game-music-store";

// Kept low so it stays "background" under the story text — started from
// the same number as stores/game-music-store.ts's DEFAULT_VOLUME, then
// quieted further (÷1.5) since a story is read, not played like the other
// minigames, and the text needs to stay the clear focus.
const VOLUME = 0.4 / 1.5;

// Loops <slug>/background.mp3 behind a story's own page — a fixed,
// story-specific track that stands in for the shared background music
// (lib/use-background-music.ts) while it plays; the story page holds that
// one paused meanwhile. On/off is the same shared setting, from the 🎵
// music settings (kit/game-music-config.tsx).
// Optional per story: most stories have no background.mp3, so there's no
// server check for whether one exists (same "a missing file just 404s"
// philosophy as the story's own image/audio/video assets, see
// lib/story-parser.ts) — `available` only flips true once the browser
// confirms it actually loaded the file.
//
// `duck`/`unduck` pause the track while a *different* sound is playing
// (a per-word `{ dido.mp3 }` clip, or a fullscreen `{ 1.avi }` video) —
// the two would otherwise overlap. This assumes at most one such clip
// plays at a time (true for how the story page actually uses it: one
// StoryAudioButton per click, one fullscreen video at a time), so `ducked`
// is a plain boolean rather than a reference count — two overlapping
// clips would incorrectly unduck on the first one's end, but nothing in
// this game can trigger that today.
export function useStoryBackgroundMusic(url: string): {
  available: boolean;
  // A word's own clip is playing (see duck/unduck).
  ducked: boolean;
  duck: () => void;
  unduck: () => void;
} {
  // Keyed by `url` (same pattern as lib/story.ts's useStory) rather than a
  // plain boolean reset inside the effect below — avoids calling setState
  // synchronously in the effect body just to flip `available` back to
  // false while a new URL's "canplaythrough" hasn't fired yet.
  const [loaded, setLoaded] = useState<{ url: string; available: boolean }>({
    url,
    available: false,
  });
  const enabled = useGameMusicStore((s) => s.musicEnabled);
  const [ducked, setDucked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Single source of truth for "should this be audible right now", read by
  // both the play/pause effect below and the gesture-unblock retry — a ref
  // (not just the `enabled`/`ducked` state) so that retry listener
  // (registered once, on mount, in the effect below) never acts on a stale
  // snapshot of either flag. This is what a previous version of this hook
  // got wrong: turning the toggle off still left a `pointerdown`/`keydown`
  // listener around that unconditionally resumed playback the next time
  // the reader tapped anything — including, awkwardly, the tap that opened
  // a *different* word's own audio clip.
  const shouldPlayRef = useRef(false);
  useEffect(() => {
    shouldPlayRef.current = enabled && !ducked;
  }, [enabled, ducked]);

  useEffect(() => {
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = VOLUME;
    audioRef.current = audio;

    const handleCanPlay = () => setLoaded({ url, available: true });
    audio.addEventListener("canplaythrough", handleCanPlay);

    // The very first play() call below usually happens without a user
    // gesture (music defaults to on, and this effect fires right on
    // mount), so browsers block it — retried on the reader's first
    // tap/keypress anywhere in the story, but only if the track is still
    // actually supposed to be playing at that moment.
    const resumeIfBlocked = () => {
      if (shouldPlayRef.current && audio.paused)
        void audio.play().catch(() => {});
    };
    document.addEventListener("pointerdown", resumeIfBlocked);
    document.addEventListener("keydown", resumeIfBlocked);

    if (shouldPlayRef.current) {
      void audio.play().catch(() => {
        // Best-effort only — resumed by resumeIfBlocked above, or never (a
        // 404 rejects here too, but that just means `available` never
        // flips true and nothing plays, silently).
      });
    }

    return () => {
      audio.removeEventListener("canplaythrough", handleCanPlay);
      document.removeEventListener("pointerdown", resumeIfBlocked);
      document.removeEventListener("keydown", resumeIfBlocked);
      audio.pause();
      audioRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (enabled && !ducked) {
      void audio.play().catch(() => {
        // Best-effort only, same as the initial play() above.
      });
    } else {
      audio.pause();
    }
  }, [enabled, ducked]);

  return {
    available: loaded.url === url && loaded.available,
    ducked,
    duck: useCallback(() => setDucked(true), []),
    unduck: useCallback(() => setDucked(false), []),
  };
}
