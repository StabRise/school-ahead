"use client";

import { useTranslations } from "next-intl";
import { useGameMusicStore } from "../stores/game-music-store";

// The 🎵/🔇 corner button every game (except Stories, which is silent by
// design) uses to toggle its looping background music — see
// lib/use-background-music.ts, which each game still calls itself to
// actually load/play audio; this button just reads/writes the shared
// on/off flag. `className` positions it (each game's chrome places it at a
// different spot in its top row).
export function MusicToggleButton({ className }: { className: string }) {
  const t = useTranslations("GameMusic");
  const musicEnabled = useGameMusicStore((s) => s.musicEnabled);
  const setMusicEnabled = useGameMusicStore((s) => s.setMusicEnabled);

  return (
    <button
      type="button"
      aria-label={musicEnabled ? t("musicOnLabel") : t("musicOffLabel")}
      onClick={() => setMusicEnabled(!musicEnabled)}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200 ${className}`}
    >
      {musicEnabled ? "🎵" : "🔇"}
    </button>
  );
}
