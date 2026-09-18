# Magic Cocktail Game

One of the preschool celebration minigames offered on `/` (see
`docs/views/preschool/README.md` §2) and at the standalone, public
`/games/cocktail` route. Implementation: `frontend/packages/preschool-games/
src/cocktail-game.tsx` (component/UI) + `lib/cocktail-game.ts` (pure round
logic, no React/DOM). Its equation-gate UI and sound effects are shared with
the Cars game (`cars.md`).

## 1. Concept

A recipe card names 2 ingredients with small counts (shown as that many
repeated icons — e.g. 🍓🍓🍓, never "🍓×3" text). Ingredient pieces are
scattered on a table; the child taps the ones matching the recipe into a
glass/shaker. Once assembled correctly, the shaker fizzes, sparkles, and
changes color, then a confetti celebration plays.

**Notable and deliberate:** this game is narrated and labeled entirely in
**Polish** (`SPEECH_LANGUAGE = "pl"`), independent of the rest of the app's
Ukrainian UI — its `next-intl` translation keys hold Polish text under the
`CocktailGame` namespace specifically for this game.

## 2. Round structure

Every round opens with an **addition-equation gate**
(`CocktailEquationGate`), built from the recipe's own two ingredient counts
(e.g. a 3-strawberry, 2-banana recipe opens with `3 + 2 = ?`). Only once
that's solved does the shaker/recipe/table actually mount. The equation gate
uses the same answer-tile + near-miss-distractor UI as the Cars game's
parking stage (`buildEquationChoices` in `lib/cocktail-game.ts` mirrors
`buildCarsAnswerChoices`).

`generateRecipe()` picks 2 distinct ingredients from a 6-item catalog
(`COCKTAIL_INGREDIENTS`: 🍓 strawberry, 🍌 banana, 🫐 blueberry, 🍊 orange, 🥝
kiwi, 🍯 syrup — each with a fixed glass-liquid tint color), each with a
random count in `[1, 3]`.

## 3. Ingredient interaction

Tap-to-move, not real drag-and-drop — same interaction model every
preschool minigame in this package uses (falling-card taps, lily-pad taps),
since this codebase has no drag-and-drop machinery. Tapping the right piece
drops it into the glass with a splash sound and crosses it off the recipe
card; a wrong pick bounces back with a sound + wobble.

## 4. Two modes (`stores/cocktail-game-store.ts`)

- **Hint** (default) — every tap is validated immediately: a correct
  ingredient goes in, a wrong one bounces back and the glass wobbles. The
  gentler, more guided mode for a first-time player.
- **Free** — the child can drop anything into the shaker until pressing the
  shaker button, which checks the whole recipe at once
  (`isRecipeExactlyMet`) — correct sends it into the celebration, wrong
  plays a fail sound and everything flies back out onto the table for a
  retry.

Both settings (mode, mute, "only equations") are persisted to
`localStorage` (`cocktail-game-store`) so they survive closing the tab, same
convention as the other preschool games' own settings stores.

## 5. "Only equations" mode

When on, a round ends the instant the opening addition equation is solved
— confetti celebration, then straight into the next equation. The
recipe/shaker stage never mounts. A "just the math problems" mode for a
child who only wants equation practice without the mixing part — same
concept and toggle name as the Cars game's own `onlyEquations` setting.

## 6. Feedback & reward

Praise/reject/win moments each pick randomly from a small set of Polish
phrases (`PRAISE_PHRASES`, `REJECT_PHRASES`, `WIN_PHRASES`) rather than
repeating the exact same line every time, so a long play session doesn't
feel robotic. Completing a cocktail plays a victory fanfare and awards a
diamond via `useDiamondMilestoneReward` → `POST
/api/auth/me/cocktail-game-reward`, once per round.
