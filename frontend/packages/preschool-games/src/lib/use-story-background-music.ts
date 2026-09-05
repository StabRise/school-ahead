"use client";

import { useEffect, useRef, useState } from "react";

// Kept low so it stays "background" under the story text — same rationale
// (and same number) as stores/game-music-store.ts's DEFAULT_VOLUME.
const VOLUME = 0.175;

// Loops <slug>/background.mp3 behind a story's own page — a fixed,
// story-specific track, unlike lib/use-background-music.ts's shared random
// pool from public/music (which the other preschool minigames use, and
// which excludes Stories by design — see kit/music-toggle-button.tsx).
// Optional per story: most stories have no background.mp3, so there's no
// server check for whether one exists (same "a missing file just 404s"
// philosophy as the story's own image/audio/video assets, see
// lib/story-parser.ts) — `available` only flips true once the browser
// confirms it actually loaded the file, and the caller's corner toggle
// button (see StoryPage) stays hidden until then, same as a story with no
// cover.<ext> just shows no cover.
export function useStoryBackgroundMusic(url: string): { available: boolean; enabled: boolean; toggle: () => void } {
  // Keyed by `url` (same pattern as lib/story.ts's useStory) rather than a
  // plain boolean reset inside the effect below — avoids calling setState
  // synchronously in the effect body just to flip `available` back to
  // false while a new URL's "canplaythrough" hasn't fired yet.
  const [loaded, setLoaded] = useState<{ url: string; available: boolean }>({ url, available: false });
  const [enabled, setEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = VOLUME;
    audioRef.current = audio;

    const handleCanPlay = () => setLoaded({ url, available: true });
    audio.addEventListener("canplaythrough", handleCanPlay);

    // The very first play() call below usually happens without a user
    // gesture (music defaults to on, and this effect fires right on
    // mount), so browsers block it — same best-effort retry as
    // lib/use-background-music.ts's resumeIfBlocked, on the reader's first
    // tap/keypress anywhere in the story.
    const resumeIfBlocked = () => {
      if (audio.paused) void audio.play().catch(() => {});
    };
    document.addEventListener("pointerdown", resumeIfBlocked);
    document.addEventListener("keydown", resumeIfBlocked);

    void audio.play().catch(() => {
      // Best-effort only — resumed by resumeIfBlocked above, or never (a
      // 404 rejects here too, but that just means `available` never flips
      // true and nothing plays, silently).
    });

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
    if (enabled) {
      void audio.play().catch(() => {
        // Best-effort only, same as the initial play() above.
      });
    } else {
      audio.pause();
    }
  }, [enabled]);

  return { available: loaded.url === url && loaded.available, enabled, toggle: () => setEnabled((current) => !current) };
}
