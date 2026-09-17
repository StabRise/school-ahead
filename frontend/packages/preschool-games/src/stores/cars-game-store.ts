import { create } from "zustand";
import { persist } from "zustand/middleware";

// Client-side settings for the preschool "Машинки" (Parking Math) minigame
// (see docs/preschool/games/cars.md). Persisted to localStorage so a chosen
// mute setting survives closing the tab — same pattern as
// stores/jumping-frogs-store.ts. Only `muted` exists here — unlike
// jumping-frogs there's no letter/difficulty setting to persist for this
// game.

interface CarsGameState {
  // Mutes this game's own Ukrainian turn-by-turn narration (see
  // cars-game.tsx's speak()/speakSequence() calls) — persisted client-side,
  // same muted/setMuted convention every other narrated game here already
  // uses, not shared across games (each game's own narration is muted
  // independently — only background music, via stores/game-music-store.ts,
  // is a single cross-game toggle).
  muted: boolean;
  setMuted: (muted: boolean) => void;
  // When on, a round ends the instant the parking-stage equation is solved
  // (confetti celebration, then straight into the next equation) — the
  // driving stage never plays. Per this feature's own request: a
  // "just the math problems" mode for a child who only wants to practice
  // приклади without the drive.
  onlyEquations: boolean;
  setOnlyEquations: (onlyEquations: boolean) => void;
}

export const useCarsGameStore = create<CarsGameState>()(
  persist(
    (set) => ({
      muted: false,
      setMuted: (muted) => set({ muted }),
      onlyEquations: false,
      setOnlyEquations: (onlyEquations) => set({ onlyEquations }),
    }),
    { name: "cars-game-store" },
  ),
);
