import { create } from "zustand";
import { persist } from "zustand/middleware";

// Client-side settings for the preschool "Jumping Frogs" minigame (see
// docs/preschool/games/jumping-frogs.md). Persisted to localStorage so a
// chosen letter/mute setting survives closing the tab — same pattern as
// stores/cards-game-store.ts.

// A consonant is just the name of its folder under public/static/letters
// (see /api/reading-game-modes) — no fixed set, so this is a plain string
// rather than a literal union, same as ReadingGameConsonant. Uppercase
// (unlike cards-game-store.ts's lowercase default) since public/static/
// letters' folders are named uppercase ("М", not "м") — the other
// consonant-picking games use lowercase because they read the differently-
// cased public/static/syllables/ folder instead.
export type JumpingFrogsConsonant = string;

const DEFAULT_CONSONANT: JumpingFrogsConsonant = "М";

// "fixed" plays every level on `consonant`; "random" re-rolls the active
// consonant to a random one (from whatever's available) at the start of
// every level, per docs/preschool/games/jumping-frogs.md §5: "в
// налаштуваннях можна вибрати літеру (рендом на літеру) або рендомне слово
// на будь яку букву".
export type JumpingFrogsLetterMode = "fixed" | "random";
const DEFAULT_LETTER_MODE: JumpingFrogsLetterMode = "fixed";

// Reading-difficulty tier: 1 = bare letters, 2 = open (consonant+vowel)
// syllables, 3 = whole words — see lib/jumping-frogs-game.ts's
// buildLetterLevel/buildSyllableLevel/buildLevel. Defaults to 3 (words) so
// the game's original, already-shipped behavior doesn't change for anyone
// who hasn't touched this setting.
export type JumpingFrogsDifficulty = 1 | 2 | 3;
const DEFAULT_DIFFICULTY: JumpingFrogsDifficulty = 3;

interface JumpingFrogsState {
  letterMode: JumpingFrogsLetterMode;
  setLetterMode: (letterMode: JumpingFrogsLetterMode) => void;
  consonant: JumpingFrogsConsonant;
  setConsonant: (consonant: JumpingFrogsConsonant) => void;
  difficulty: JumpingFrogsDifficulty;
  setDifficulty: (difficulty: JumpingFrogsDifficulty) => void;
  // Silences the spoken-aloud word (recording/TTS) — the jump/miss/
  // celebration sound effects still play, since they aren't tied to this
  // setting (same convention as stores/cards-game-store.ts's `muted`).
  muted: boolean;
  setMuted: (muted: boolean) => void;
}

export const useJumpingFrogsStore = create<JumpingFrogsState>()(
  persist(
    (set) => ({
      letterMode: DEFAULT_LETTER_MODE,
      setLetterMode: (letterMode) => set({ letterMode }),
      consonant: DEFAULT_CONSONANT,
      setConsonant: (consonant) => set({ consonant }),
      difficulty: DEFAULT_DIFFICULTY,
      setDifficulty: (difficulty) => set({ difficulty }),
      muted: false,
      setMuted: (muted) => set({ muted }),
    }),
    { name: "jumping-frogs-store" },
  ),
);
