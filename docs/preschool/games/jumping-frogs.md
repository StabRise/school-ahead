# Jumping Frogs Game

A reading/attention preschool minigame. Implementation:
`frontend/packages/preschool-games/src/jumping-frogs-game.tsx` (component/
UI) + `lib/jumping-frogs-game.ts` (level generation, no React/DOM). Reuses
the same syllable-card rendering as the "Казки" (Stories) game
(`lib/syllable-card.tsx`) and content sourced from `reading-game`'s own
consonant-folder convention (`public/static/letters/`, see
`reading/README.md`).

## 1. Concept

A frog crosses a river by hopping across `ROWS_PER_LEVEL` (10) rows of lily
pads. A target word is shown, split into syllable cards, in the header for
the whole level. Each row offers 3 word choices (also rendered as syllable
cards); tapping the one matching the target hops the frog onto it. Reaching
the far bank celebrates and starts a new word/level.

## 2. Play area & camera

Modeled as `SLOT_COUNT = ROWS_PER_LEVEL + 2` fixed vertical slots: slot 0 is
the start bank, slots 1–10 the lily-pad rows, the last slot the finish bank
— so hopping onto the far bank after the last row reuses the exact same
jump/pan animation as an ordinary row hop. Only 4 slots are visible at once
(`VISIBLE_SLOTS`); the camera pans smoothly as the frog advances, matching
the brief's "3 rows + a bank visible at a time, scrolling as it climbs"
description. Each row has 3 lily pads (`COLUMN_PERCENTS`); answer cards are
only shown on the row the frog is currently choosing between — passed rows'
lily pads go bare (or show a decorative pink water-lily flower, no answer
choices), and cards fade in on the new active row as the previous row's
disappear.

## 3. Choosing & feedback

- **Wrong pick:** the frog stays put (no jump). The tapped word is spoken
  aloud first, then a muffled "pouf" error sound plays, then that lily pad's
  card disappears — that option is gone for the rest of the round; only
  not-yet-tried options remain.
- **Correct pick:** a success sound plays, the frog animates a jump onto
  that lily pad, and the camera pans up to the next row.
- **Level finish:** after the last row, a large celebration animation
  (fireworks, ~4.2s) plays, then a new target word/level starts. A signed-in
  student earns a diamond via `useDiamondMilestoneReward` →
  `POST /api/auth/me/jumping-frogs-reward`.

## 4. Audio

Light background music (toggleable, shared `MusicToggleButton`/
`useBackgroundMusic` convention with the other minigames). Words are spoken
on tap/appearance in Ukrainian — a real recording is used if the target
word's audio folder has one, otherwise TTS, mutable independently in
settings. Distinct sound effects for jumps, successful hops, and the
error "pouf."

## 5. Word content & syllable splitting

Words are sourced from `frontend/apps/web/public/static/letters/` (same
consonant-folder convention as the reading/cards games), where each
picture's filename is the word itself. `splitUkrainianSyllables`
(`lib/jumping-frogs-game.ts`) breaks a word into syllable cards the same way
as the "Казки" game's own card syntax — grouping a consonant with its
following vowel — e.g. Мавпа → `Ма-в-па`, Яблуко → `Я-б-лу-ко`, Торт →
`То-р-т`, Маяк → `Ма-я-к`.

## 6. Settings (`stores/jumping-frogs-store.ts`, persisted to `localStorage`)

- **Letter mode:** `fixed` (always play the chosen consonant, default `М`)
  or `random` (re-rolls the active consonant to a random available one at
  the start of every level).
- **Difficulty (1–3):** `1` = bare letters, `2` = open consonant+vowel
  syllables, `3` = whole words (`buildLetterLevel`/`buildSyllableLevel`/
  `buildLevel` in `lib/jumping-frogs-game.ts`). Defaults to `3` (words), the
  game's original shipped behavior.
- **Mute:** silences the spoken word only — jump/miss/celebration sound
  effects are unaffected, same convention as the Cards game's own `muted`
  setting.
