"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useBackgroundMusicTracks } from "../lib/background-music-tracks";
import { useBackgroundMusicPlayer } from "../lib/use-background-music";
import { RANDOM_TRACK, useGameMusicStore } from "../stores/game-music-store";
import {
  GAME_MUSIC_CONFIG_POSITION,
  GAME_MUSIC_CONFIG_PANEL_POSITION,
} from "./game-controls";

// Background music for a /games minigame: the one player (see
// lib/use-background-music.ts) plus its settings — a 🎵 button in the
// page's top-right corner that opens a small dropdown with the music on/off
// switch and, while on, the track picker (a specific track, or random).
// Mounted once per game page (game-play-page.tsx, and the dashboard's
// PreschoolCelebration while a game is open), so every game gets the same
// music and the same control without wiring it up itself.
export function GameMusic() {
  const tracks = useBackgroundMusicTracks();
  useBackgroundMusicPlayer(tracks);
  const t = useTranslations("GameMusic");
  const musicEnabled = useGameMusicStore((s) => s.musicEnabled);
  const setMusicEnabled = useGameMusicStore((s) => s.setMusicEnabled);
  const selectedTrack = useGameMusicStore((s) => s.selectedTrack);
  const setSelectedTrack = useGameMusicStore((s) => s.setSelectedTrack);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on a tap anywhere else, or Escape.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // A track that has since been removed falls back to random.
  const selectValue =
    selectedTrack === RANDOM_TRACK ||
    tracks.some((track) => track.key === selectedTrack)
      ? selectedTrack
      : RANDOM_TRACK;

  return (
    <div ref={containerRef}>
      <button
        type="button"
        aria-label={t("settingsLabel")}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ${
          open ? "ring-sky-400" : "ring-gray-200"
        } ${GAME_MUSIC_CONFIG_POSITION}`}
      >
        {musicEnabled ? "🎵" : "🔇"}
      </button>

      {open && (
        <div
          className={`flex w-60 flex-col gap-3 rounded-2xl bg-white p-4 text-left text-sm shadow-xl ring-2 ring-sky-200 ${GAME_MUSIC_CONFIG_PANEL_POSITION}`}
        >
          <label className="flex cursor-pointer items-center justify-between gap-3 font-bold text-gray-700">
            {t("musicLabel")}
            <input
              type="checkbox"
              role="switch"
              checked={musicEnabled}
              onChange={(e) => setMusicEnabled(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="relative h-6 w-11 shrink-0 rounded-full bg-gray-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-emerald-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400"
            />
          </label>

          {musicEnabled && (
            <label className="flex flex-col gap-1 font-bold text-gray-700">
              {t("trackLabel")}
              <select
                value={selectValue}
                onChange={(e) => setSelectedTrack(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm font-medium text-gray-800 focus:border-sky-400 focus:outline-none"
              >
                <option value={RANDOM_TRACK}>🔀 {t("randomTrack")}</option>
                {tracks.map((track) => (
                  <option key={track.key} value={track.key}>
                    {track.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
