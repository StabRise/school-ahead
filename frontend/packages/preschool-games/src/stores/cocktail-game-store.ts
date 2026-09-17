import { create } from "zustand";
import { persist } from "zustand/middleware";

// Client-side settings for the preschool "Magic Cocktail" minigame (see
// docs/preschool/games/cocktail.md). Persisted to localStorage so a chosen
// mode survives closing the tab — same pattern as stores/jumping-frogs-store.ts.

// "hint" validates every tapped ingredient immediately (wrong ones bounce
// back rather than going in); "free" accepts anything until the shaker
// button is pressed, then checks the whole recipe at once — see the
// brief's own two-mode request. Defaults to "hint" since that's the
// gentler, more guided experience for a first-time player.
export type CocktailMode = "hint" | "free";
const DEFAULT_MODE: CocktailMode = "hint";

interface CocktailGameState {
  mode: CocktailMode;
  setMode: (mode: CocktailMode) => void;
  // Mutes this game's own Polish narration (see cocktail-game.tsx's speak()/
  // speakSequence() calls) — persisted client-side, same muted/setMuted
  // convention every other narrated game here already uses (see e.g.
  // stores/jumping-frogs-store.ts), not shared across games (each game's
  // own narration is muted independently, matching that same precedent —
  // only background music, via stores/game-music-store.ts, is a single
  // cross-game toggle).
  muted: boolean;
  setMuted: (muted: boolean) => void;
  // When on, a round ends the instant the opening addition equation is
  // solved (confetti celebration, then straight into the next equation) —
  // the recipe/shaker stage never mounts. Per this feature's own request: a
  // "just the math problems" mode for a child who only wants to practice
  // przykłady without mixing the cocktail.
  onlyEquations: boolean;
  setOnlyEquations: (onlyEquations: boolean) => void;
}

export const useCocktailGameStore = create<CocktailGameState>()(
  persist(
    (set) => ({
      mode: DEFAULT_MODE,
      setMode: (mode) => set({ mode }),
      muted: false,
      setMuted: (muted) => set({ muted }),
      onlyEquations: false,
      setOnlyEquations: (onlyEquations) => set({ onlyEquations }),
    }),
    { name: "cocktail-game-store" },
  ),
);
