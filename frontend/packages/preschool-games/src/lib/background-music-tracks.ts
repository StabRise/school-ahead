"use client";

import { useEffect, useState } from "react";
import { listPreschoolBackgroundMusic } from "@school-ahead/api-client/browser/preschool/preschool";

export interface BackgroundMusicTrack {
  // Stable id stored as the player's selectedTrack (stores/game-music-store.ts).
  key: string;
  title: string;
  url: string;
}

// The active tracks uploaded in the Django admin (backend preschool.
// BackgroundMusic). Until any are uploaded, falls back to the .mp3 files in
// public/static/music (app/api/music-tracks), which is what every game
// played before the tracks moved to the DB.
async function fetchTracks(): Promise<BackgroundMusicTrack[]> {
  const dbTracks = await listPreschoolBackgroundMusic().catch(() => []);
  if (dbTracks.length > 0) {
    return dbTracks.map((track) => ({
      key: `db-${track.id}`,
      title: track.title,
      url: track.url,
    }));
  }
  const staticTracks = await fetch("/api/music-tracks")
    .then((res) => res.json())
    .then((data: { tracks: string[] }) => data.tracks)
    .catch(() => [] as string[]);
  return staticTracks.map((url) => ({
    key: url,
    title: decodeURIComponent(url.split("/").pop() ?? url).replace(
      /\.[^.]+$/,
      "",
    ),
    url: encodeURI(url),
  }));
}

// Fetched once per page load and shared by the player and its settings.
let tracksPromise: Promise<BackgroundMusicTrack[]> | null = null;

export function loadBackgroundMusicTracks(): Promise<BackgroundMusicTrack[]> {
  if (!tracksPromise) tracksPromise = fetchTracks();
  return tracksPromise;
}

export function useBackgroundMusicTracks(): BackgroundMusicTrack[] {
  const [tracks, setTracks] = useState<BackgroundMusicTrack[]>([]);
  useEffect(() => {
    let cancelled = false;
    void loadBackgroundMusicTracks().then((result) => {
      if (!cancelled) setTracks(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return tracks;
}
