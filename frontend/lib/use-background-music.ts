"use client";

import { useEffect, useRef } from "react";
import { useGameMusicStore } from "@/stores/game-music-store";

// Cached module-wide so every game mounting the hook shares one fetch
// instead of hitting the API route per game. The route (app/api/music-tracks)
// reads public/music fresh on every request, so dropping a new .mp3 there
// picks it up with no code change on either side.
let tracksPromise: Promise<string[]> | null = null;

function fetchTracks(): Promise<string[]> {
  if (!tracksPromise) {
    tracksPromise = fetch("/api/music-tracks")
      .then((res) => res.json())
      .then((data: { tracks: string[] }) => data.tracks)
      .catch(() => []);
  }
  return tracksPromise;
}

function pickTrack(tracks: string[], exclude?: string): string | undefined {
  if (tracks.length === 0) return undefined;
  if (tracks.length === 1) return tracks[0];
  let track = tracks[Math.floor(Math.random() * tracks.length)];
  while (track === exclude) {
    track = tracks[Math.floor(Math.random() * tracks.length)];
  }
  return track;
}

// Loops a random track from public/music behind a preschool minigame,
// picking a new random one (never repeating the one that just finished)
// whenever the current one ends. Purely a side effect — the corner on/off
// button lives in each game and reads/writes useGameMusicStore directly.
export function useBackgroundMusic() {
  const enabled = useGameMusicStore((s) => s.musicEnabled);
  const volume = useGameMusicStore((s) => s.volume);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tracksRef = useRef<string[]>([]);
  const currentTrackRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const audio = new Audio();
    audio.volume = useGameMusicStore.getState().volume;
    audioRef.current = audio;

    const playNextTrack = () => {
      const track = pickTrack(tracksRef.current, currentTrackRef.current);
      if (!track) return;
      currentTrackRef.current = track;
      audio.src = encodeURI(track);
      void audio.play().catch(() => {
        // Best-effort only — autoplay may be blocked until a user gesture,
        // resumed below by resumeIfBlocked.
      });
    };
    audio.addEventListener("ended", playNextTrack);

    // The very first play() call usually happens without a user gesture
    // (music defaults to on, and the effect below fires on mount), so
    // browsers block it. Retry on the child's first tap/keypress in the
    // game — that's a real gesture and satisfies the autoplay policy.
    const resumeIfBlocked = () => {
      if (!useGameMusicStore.getState().musicEnabled || !audio.paused) return;
      if (!currentTrackRef.current) {
        playNextTrack();
      } else {
        void audio.play().catch(() => {});
      }
    };
    document.addEventListener("pointerdown", resumeIfBlocked);
    document.addEventListener("keydown", resumeIfBlocked);

    void fetchTracks().then((tracks) => {
      if (cancelled) return;
      tracksRef.current = tracks;
      if (useGameMusicStore.getState().musicEnabled) playNextTrack();
    });

    return () => {
      cancelled = true;
      audio.removeEventListener("ended", playNextTrack);
      document.removeEventListener("pointerdown", resumeIfBlocked);
      document.removeEventListener("keydown", resumeIfBlocked);
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!enabled) {
      audio.pause();
      return;
    }
    if (!currentTrackRef.current) {
      const track = pickTrack(tracksRef.current);
      if (track) {
        currentTrackRef.current = track;
        audio.src = encodeURI(track);
      }
    }
    if (currentTrackRef.current) {
      void audio.play().catch(() => {
        // Best-effort only — autoplay may be blocked until a user gesture.
      });
    }
  }, [enabled]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);
}
