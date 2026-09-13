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
}

export const useCocktailGameStore = create<CocktailGameState>()(
  persist(
    (set) => ({
      mode: DEFAULT_MODE,
      setMode: (mode) => set({ mode }),
    }),
    { name: "cocktail-game-store" },
  ),
);
