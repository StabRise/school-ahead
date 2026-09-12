import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clampLevel, DEFAULT_CHOICE_COUNT, DEFAULT_LEVEL, DEFAULT_OPERATION, type Operation } from "../lib/math-game";

// Client-side settings for the math-runner minigame — avatar running speed,
// hotbar size, operation, and level (see math-game.tsx) — same shape as
// trains-game-store.ts's `speed`, persisted so a chosen setting survives
// closing the tab instead of resetting every session.

const DEFAULT_SPEED = 0.5;

interface MathGameState {
  speed: number;
  setSpeed: (speed: number) => void;
  // How many hotbar slots each question offers — see lib/math-game.ts's
  // MIN_CHOICE_COUNT/MAX_CHOICE_COUNT for the allowed range.
  choiceCount: number;
  setChoiceCount: (choiceCount: number) => void;
  // Which arithmetic operation is being practiced — see lib/math-game.ts's
  // OPERATIONS.
  operation: Operation;
  setOperation: (operation: Operation) => void;
  // Difficulty rung within the current operation's ladder — see
  // lib/math-game.ts's MAX_LEVEL_BY_OPERATION. Switching operation clamps
  // the stored level into the new operation's range (e.g. "count" only goes
  // up to 3) rather than leaving an out-of-range value sitting in storage.
  level: number;
  setLevel: (level: number) => void;
  // Multiply/divide only (see MathRun's PauseOverlay) — while paused, shows
  // the full times-table for the current question's key number (the first
  // factor for multiply, the divisor for divide) as a study aid. Off by
  // default: a hint the child didn't ask for isn't a hint.
  showHint: boolean;
  setShowHint: (showHint: boolean) => void;
}

export const useMathGameStore = create<MathGameState>()(
  persist(
    (set, get) => ({
      speed: DEFAULT_SPEED,
      setSpeed: (speed) => set({ speed }),
      choiceCount: DEFAULT_CHOICE_COUNT,
      setChoiceCount: (choiceCount) => set({ choiceCount }),
      operation: DEFAULT_OPERATION,
      setOperation: (operation) => set({ operation, level: clampLevel(operation, get().level) }),
      level: DEFAULT_LEVEL,
      setLevel: (level) => set({ level: clampLevel(get().operation, level) }),
      showHint: false,
      setShowHint: (showHint) => set({ showHint }),
    }),
    { name: "math-game-store" },
  ),
);
