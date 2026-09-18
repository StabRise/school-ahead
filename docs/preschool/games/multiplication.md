# Math Runner Game

**Status note:** the original design brief below was a Minecraft-themed
"Steve" character concept, for multiplication practice only. It was
**superseded during implementation**, per user feedback: the runner is the
student's own equipped avatar (not a fixed character), and the game grew to
cover five arithmetic operations, not just multiplication. The backend
reward endpoint still literally reads `multiplication-game-reward` (the
feature's original name), but the shipped game itself is a general math
runner. Implementation: `frontend/packages/preschool-games/src/
math-game.tsx` (component/UI) + `lib/math-game.ts` (pure question
generation, no React/DOM — covered by Vitest independently, same split as
`lib/reading-game.ts`'s `selectLevel`).

## 1. Concept

The student's equipped avatar (`@school-ahead/avatar`'s
`useEquippedAvatarLayers`/`AvatarBadge`) runs continuously along a
full-width track toward a pit. An arithmetic question shows; the student
picks the answer from a hotbar of number tiles before the avatar reaches the
edge. A correct answer builds a bridge across the pit — the avatar dashes
across and off the right edge; a wrong answer (or no answer at all,
timeout) never builds one — the avatar dashes in anyway and falls, costing
one of 3 hearts (`LIVES = 3`).

## 2. Operations & levels

Five operations (`Operation` type, `OPERATIONS` in `lib/math-game.ts`,
in settings-panel order): **count, add, subtract, multiply, divide**
— default `multiply`. Each has its own difficulty ladder
(`MAX_LEVEL_BY_OPERATION`): `count` has 8 rungs, the other four have 5;
default level is 5. Switching operation clamps the stored level into the
new operation's valid range (e.g. `count` only goes up to level 3's worth of
its own ladder) rather than leaving an out-of-range value in storage.

A run clears — and pays out its diamond — after `QUESTION_COUNT = 10`
questions solved. Answering right or wrong both immediately cut the current
run-to-the-pit short: the avatar "rushes" the rest of the way at a fixed,
quick pace instead of continuing at the normal pace for however much run
was left, so a round never drags once the answer's already known.

## 3. Hotbar & distractors

The number of answer tiles is player-configurable (`choiceCount`, `6-10`,
default 8, `stores/math-game-store.ts`). At low levels where the true answer
range is smaller than the hotbar (e.g. `count` level 1 only has 4 possible
answers, 0-3), `buildChoiceSet` shrinks the actual choice count for that
question rather than padding with impossible numbers or repeated values.

## 4. Settings (`stores/math-game-store.ts`, persisted to `localStorage`)

- **Speed** — the avatar's running pace (default `0.5`), same shape as the
  Trains game's own `speed` setting.
- **Choice count** — hotbar size, `6-10` (see §3).
- **Operation** and **Level** — see §2.
- **Show hint** (multiply/divide only) — while paused, shows the full
  times-table for the current question's key number (the first factor for
  multiply, the divisor for divide) as a study aid. Off by default — an
  unrequested hint isn't a hint.

## 5. Feedback & reward

A progress bar and 3 hearts show at the top; a wrong answer/fall removes a
heart. Clearing all `QUESTION_COUNT` questions with at least 1 heart left
plays a celebration and awards a diamond via `useDiamondMilestoneReward`
(`mode: "level"`) → `POST /api/auth/me/multiplication-game-reward`.

## 6. Implementation note: movement

Avatar movement is driven by plain CSS `transition`s on `left`/`transform`
(retargeted from React state), not `@keyframes` — a `transition`'s
`transitionend` only fires for the property that actually moved on its own
element (unlike `animationend`, which can bubble up from an unrelated
child's own finite CSS animation, e.g. the avatar's happy/sad mood
animation), avoiding a nested animation prematurely ending a round.

---

## Original design brief (superseded, kept for history)

The rest of this section is the original Ukrainian brief, translated,
describing the pre-implementation Minecraft-themed concept — not what
shipped (see the status note at the top).

**Working title:** "Minecraft Math Runner" (multiplication table practice)

**Concept:** A pixel-art 2D side-scrolling runner in a Minecraft visual
style (grass/dirt blocks, a hotbar UI, health hearts). The character (a 2D
pixel-art "Steve") auto-runs left to right along a track. Reaching the edge
of a chasm pauses movement, waiting for the player's answer.

**Gameplay:** A multiplication question appears at the top (e.g. `3 × 7 =
?`), factors randomized in `2×2`–`10×10`. A Minecraft-style hotbar of 8
answer blocks appears at the bottom; the player clicks a block or presses
the matching key. A correct answer builds a bridge across the chasm (with a
Minecraft-style success sound) and the character continues; a wrong answer
means the character falls in (damage sound) and loses a life, then
continues from the next segment.

**Session structure:** 20 questions per session, 3 lives (hearts). Game
over on losing all 3 lives (shows questions solved + a retry button);
victory on clearing all 20 questions (a victory animation + congratulations
screen).

**Answer-choice generation:** exactly one of the 8 hotbar options is
correct; the other 7 are plausible near-misses (adjacent multiplication
results, numbers sharing the same last digit, or results from an adjacent
factor) rather than obviously-wrong numbers, so a child can't just guess by
elimination. All 8 are shuffled so the correct answer's position varies.

**UI:** top panel shows the question (large pixel font), a progress counter
("Question 4/20"), and 3 hearts; bottom panel is the 8-slot Minecraft-style
hotbar. Audio: footstep sounds, hotbar click sound, a build/success sound,
and a fall/damage sound (ideally Minecraft's own sounds or licensed
equivalents).
