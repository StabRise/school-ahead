import { create } from "zustand";
import { persist } from "zustand/middleware";

// Background music behind every /games minigame — played by the one
// GameMusic player the game page mounts (kit/game-music-config.tsx, see
// lib/use-background-music.ts) and set from its top-right settings
// dropdown. Independent of each game's own text-to-speech: letters/values
// are always read aloud regardless of this setting.

const DEFAULT_VOLUME = 0.4;

// `selectedTrack` value meaning "a random track, a new one after each ends".
export const RANDOM_TRACK = "random";

interface GameMusicState {
  musicEnabled: boolean;
  setMusicEnabled: (musicEnabled: boolean) => void;
  // RANDOM_TRACK, or one track's `key` (see lib/background-music-tracks.ts)
  // to loop just that one.
  selectedTrack: string;
  setSelectedTrack: (selectedTrack: string) => void;
  volume: number;
  setVolume: (volume: number) => void;
  // How many parts of the page currently want the music silent without
  // turning it off (a game's pause screen, a story's own soundtrack or
  // read-aloud clip) — see usePauseBackgroundMusic. Not persisted.
  pauseRequests: number;
  addPauseRequest: () => void;
  removePauseRequest: () => void;
}

export const useGameMusicStore = create<GameMusicState>()(
  persist(
    (set) => ({
      musicEnabled: true,
      setMusicEnabled: (musicEnabled) => set({ musicEnabled }),
      selectedTrack: RANDOM_TRACK,
      setSelectedTrack: (selectedTrack) => set({ selectedTrack }),
      volume: DEFAULT_VOLUME,
      setVolume: (volume) => set({ volume }),
      pauseRequests: 0,
      addPauseRequest: () =>
        set((s) => ({ pauseRequests: s.pauseRequests + 1 })),
      removePauseRequest: () =>
        set((s) => ({ pauseRequests: Math.max(0, s.pauseRequests - 1) })),
    }),
    {
      name: "game-music-store",
      partialize: ({ musicEnabled, selectedTrack, volume }) => ({
        musicEnabled,
        selectedTrack,
        volume,
      }),
    },
  ),
);
