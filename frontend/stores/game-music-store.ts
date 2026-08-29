import { create } from "zustand";
import { persist } from "zustand/middleware";

// Whether looping background music plays behind the preschool celebration
// minigames (balloon pop, letter train) — see lib/use-background-music.ts.
// Independent of each game's own text-to-speech: letters/values are always
// read aloud regardless of this setting.

const DEFAULT_VOLUME = 0.175;

interface GameMusicState {
  musicEnabled: boolean;
  setMusicEnabled: (musicEnabled: boolean) => void;
  volume: number;
  setVolume: (volume: number) => void;
}

export const useGameMusicStore = create<GameMusicState>()(
  persist(
    (set) => ({
      musicEnabled: true,
      setMusicEnabled: (musicEnabled) => set({ musicEnabled }),
      volume: DEFAULT_VOLUME,
      setVolume: (volume) => set({ volume }),
    }),
    { name: "game-music-store" },
  ),
);
