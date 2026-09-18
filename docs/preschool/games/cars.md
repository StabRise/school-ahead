# Cars Game ("Машинки" / Parking Math)

One of the preschool celebration minigames offered on `/` (see
`docs/views/preschool/README.md` §2) and at the standalone, public
`/games/cars` route. Implementation: `frontend/packages/preschool-games/
src/cars-game.tsx` (component/UI) + `lib/cars-game.ts` (pure round-generation
logic, no React/DOM, same testability convention as `lib/cocktail-game.ts`
and `lib/math-game.ts`). Shares its answer-tile/near-miss-distractor UI and
sound effects with the Cocktail game (`cocktail.md`).

## 1. Concept

The child solves a subtraction equation illustrated by a row of parked cars,
then drives the resulting number of cars along a generated road, through a
sequence of turns, to a randomly chosen destination.

## 2. Round loop

One round has two phases (three if a setting changes the flow, see §6):

1. **Parking** (`CarsParkingStage`) — an equation and answer tiles.
2. **Driving** (`CarsDrivingStage`) — the answer-many cars drive a generated
   route with turns.
3. **Arrival** — a celebration screen, then a diamond reward.

A new round (fresh equation, fresh route, fresh destination) starts
immediately after — no round limit, no progress bar, no "lives," matching
the Cocktail game's own no-fail design.

## 3. Parking stage

`generateCarsEquation()` (`lib/cars-game.ts`) picks `total` in `[3, 8]` and
`subtract` in `[1, total - 1]`, so `answer = total - subtract` is always in
`[1, total - 1]` — never 0 (nothing would drive off) and never `total`
(nothing stays parked). `total` distinct car emoji (`CAR_EMOJI`, 8-icon
catalog, no repeats needed at this range) are drawn as the parking lot; the
child picks the answer from 4 tiles (`buildCarsAnswerChoices`) — the correct
one plus up to 3 off-by-1/2 near-miss distractors, same distractor shape as
the Cocktail game's equation gate.

Before or after answering, the child can optionally **tap up to
`subtract`-many specific parked cars** to mark exactly which ones will
depart (crossed out with a diagonal strikethrough bar, not CSS
`text-decoration`, since only a diagonal line reads correctly here); tapping
past the cap plays a "no more room" sound instead. This is purely cosmetic —
skipping straight to the answer tiles works too, and any cars not
pre-marked are picked randomly (`pickRandomIndices`) to fill out the
departing group once the equation is solved.

A correct tap flashes green (500ms), then the equation resolves and the
stage auto-advances to driving after 1.5s — no "Go" button.

## 4. Driving stage

Nav-app style: **the car sprite never moves or rotates on screen** — it
stays fixed, centered, always pointing up. The road map itself pans and
rotates underneath it (`mapRotationDeg`, ±90° per turn), so "drive straight"
always means "hold ↑" regardless of the route's actual heading at that
point — the same convention a phone GPS uses in course-up mode. Only one car
is actually driven/controlled even if several were marked as departing, to
keep it simple for the child to track.

- **Control:** arrow keys only (no on-screen buttons). The car advances
  along the route only while the currently-held key matches the required
  direction (`requiredDirection`) — release, or hold the wrong key, and it
  simply stops advancing (never resets). Holding the wrong key at any point
  bounces with a sound + shake, not just at a turn.
- **Turns:** each generated route (`generateCarsRoute`) has a sequence of
  right-angle turns. Approaching one shows a direction arrow + label at the
  top of the screen (`CarsTurnInfo`) and speaks a hardcoded Ukrainian phrase
  once ("Поверни направо!" / "Поверни наліво!" / "Проїдь прямо!" —
  `TURN_PHRASES`), independent of the on-screen `next-intl` labels, same
  convention as the Cocktail game's own spoken phrases.
- **Destinations:** picked randomly from 4 (`DESTINATIONS` in
  `lib/cars-game.ts`): 🏬 Mall, 🏫 School, 🎡 Amusement Park, 🏖️ Beach.
- **Arrival:** confetti, a victory fanfare, a spoken celebration phrase, and
  a diamond reward via `useDiamondMilestoneReward` (`mode: "level"`) →
  `POST /api/auth/me/cars-game-reward`.

## 5. Deliberate simplification

Each round generates exactly **one** path (straight segments with single
left/right turns) to the chosen destination, not a real branching road
network — a wrong key press just retries the same intersection rather than
routing the car down a different street. This preserves the feel of "a map
bigger than the screen, a camera that tracks movement, real intersections
with signs/arrows/narration" without building a full pathfinding/road-graph
engine.

## 6. Settings

A ⚙️ panel (top-left) offers:

- **Mute** — disables the spoken turn/arrival phrases.
- **Only equations** (`onlyEquations`) — skips the driving stage entirely;
  solving the parking-stage equation ends the round immediately with a
  shorter confetti celebration (1.8s), then starts a fresh equation. Useful
  for focusing purely on the subtraction practice.

Background music plays via the shared `useBackgroundMusic` hook, same as
other minigames in this package.
