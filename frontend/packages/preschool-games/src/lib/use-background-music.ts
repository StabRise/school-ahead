"use client";

import { useEffect, useRef } from "react";
import { RANDOM_TRACK, useGameMusicStore } from "../stores/game-music-store";
import type { BackgroundMusicTrack } from "./background-music-tracks";

function pickRandomTrack(
  tracks: BackgroundMusicTrack[],
  excludeKey?: string,
): BackgroundMusicTrack | undefined {
  if (tracks.length === 0) return undefined;
  if (tracks.length === 1) return tracks[0];
  const candidates = tracks.filter((track) => track.key !== excludeKey);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// The one background-music player behind a /games minigame — mounted once
// per game page by GameMusic (kit/game-music-config.tsx), never by a game
// itself. Plays the track picked in its settings on a loop, or with
// RANDOM_TRACK a random one, then another random one (never the one that
// just finished) each time a track ends. Silent while music is turned off
// or while anything holds a pause request (usePauseBackgroundMusic).
export function useBackgroundMusicPlayer(tracks: BackgroundMusicTrack[]) {
  const enabled = useGameMusicStore((s) => s.musicEnabled);
  const selectedTrack = useGameMusicStore((s) => s.selectedTrack);
  const paused = useGameMusicStore((s) => s.pauseRequests > 0);
  const volume = useGameMusicStore((s) => s.volume);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentKeyRef = useRef<string | undefined>(undefined);
  const tracksRef = useRef(tracks);
  const shouldPlayRef = useRef(false);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  useEffect(() => {
    shouldPlayRef.current = enabled && !paused;
  }, [enabled, paused]);

  // One <audio> for the page's lifetime.
  useEffect(() => {
    const audio = new Audio();
    audio.volume = useGameMusicStore.getState().volume;
    audioRef.current = audio;

    // Random mode moves on to another track when one ends; a picked track
    // has `loop` set instead and never fires "ended".
    const playNextRandom = () => {
      const next = pickRandomTrack(tracksRef.current, currentKeyRef.current);
      if (!next) return;
      currentKeyRef.current = next.key;
      audio.src = next.url;
      if (shouldPlayRef.current) void audio.play().catch(() => {});
    };
    audio.addEventListener("ended", playNextRandom);

    // The first play() usually happens without a user gesture (music
    // defaults to on), so browsers block it — retried on the child's first
    // tap/keypress, but only while music is actually supposed to play.
    const resumeIfBlocked = () => {
      if (shouldPlayRef.current && audio.paused && audio.src)
        void audio.play().catch(() => {});
    };
    document.addEventListener("pointerdown", resumeIfBlocked);
    document.addEventListener("keydown", resumeIfBlocked);

    return () => {
      audio.removeEventListener("ended", playNextRandom);
      document.removeEventListener("pointerdown", resumeIfBlocked);
      document.removeEventListener("keydown", resumeIfBlocked);
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  // Which track is loaded: switches right away when the choice changes (or
  // once the track list arrives).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || tracks.length === 0) return;
    const picked =
      selectedTrack === RANDOM_TRACK
        ? undefined
        : tracks.find((track) => track.key === selectedTrack);
    audio.loop = picked !== undefined;
    if (picked) {
      if (currentKeyRef.current === picked.key) return;
      currentKeyRef.current = picked.key;
      audio.src = picked.url;
    } else {
      // Random: keep whatever is already playing (loop is now off, so a
      // random one follows once it ends).
      if (tracks.some((track) => track.key === currentKeyRef.current)) return;
      const next = pickRandomTrack(tracks);
      if (!next) return;
      currentKeyRef.current = next.key;
      audio.src = next.url;
    }
    if (shouldPlayRef.current) void audio.play().catch(() => {});
  }, [tracks, selectedTrack]);

  // Play / pause.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (enabled && !paused) {
      if (audio.src) void audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [enabled, paused]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);
}

// Silences the background music while `active` is true, without turning it
// off — e.g. the math game's pause screen, or a story that has its own
// soundtrack or is playing a read-aloud clip.
export function usePauseBackgroundMusic(active: boolean) {
  const addPauseRequest = useGameMusicStore((s) => s.addPauseRequest);
  const removePauseRequest = useGameMusicStore((s) => s.removePauseRequest);
  useEffect(() => {
    if (!active) return;
    addPauseRequest();
    return () => removePauseRequest();
  }, [active, addPauseRequest, removePauseRequest]);
}
