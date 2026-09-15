// Pure logic for the "Машинки" (Parking Math) preschool minigame — see
// docs/preschool/games/cars.md for the design brief. No React/DOM here, same
// testability contract as lib/cocktail-game.ts/lib/math-game.ts.

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// --- Parking-lot equation -------------------------------------------------

// A small, fixed catalog of distinct car emoji (not one repeated 🚗) — same
// "small emoji catalog" precedent as COCKTAIL_INGREDIENTS in
// lib/cocktail-game.ts. Reused both for the parked-cars illustration and the
// departing convoy.
export const CAR_EMOJI = ["🚗", "🚕", "🚙", "🚓", "🚌", "🚑", "🛻", "🚐"] as const;

// Every unit here is an individually drawn icon a preschooler has to
// visually count and tap, not an abstract digit — so this stays much
// smaller than math-game.ts's SUBTRACT_MAX_BY_LEVEL (up to 100). 8 parked
// cars is already the readability ceiling for one row on a phone width.
const TOTAL_RANGE = [3, 8] as const;

export interface CarsEquation {
  total: number;
  subtract: number;
  answer: number;
}

// A random "total − subtract = answer" subtraction fact — `subtract` is
// always strictly between 0 and `total`, so `answer` is always in
// [1, total-1]: never 0 (nothing would drive off) and never `total` (nothing
// would stay parked to illustrate the minuend).
export function generateCarsEquation(): CarsEquation {
  const total = randomInt(...TOTAL_RANGE);
  const subtract = randomInt(1, total - 1);
  return { total, subtract, answer: total - subtract };
}

// Plausible near-miss wrong answers (off by 1-2 either way), clamped at >= 0
// — directly mirrors buildEquationChoices in lib/cocktail-game.ts.
const MIN_ANSWER_CHOICE = 0;

export function buildCarsAnswerChoices(answer: number, choiceCount = 4): { choices: number[]; correctIndex: number } {
  const candidates = shuffle([answer - 2, answer - 1, answer + 1, answer + 2].filter((n) => n >= MIN_ANSWER_CHOICE && n !== answer));
  const distractors = candidates.slice(0, choiceCount - 1);
  const choices = [answer, ...distractors].sort((a, b) => a - b);
  return { choices, correctIndex: choices.indexOf(answer) };
}

// --- Driving route ---------------------------------------------------------

export interface CarsDestination {
  key: string;
  emoji: string;
  label: string;
}

export const DESTINATIONS: CarsDestination[] = [
  { key: "mall", emoji: "🏬", label: "Торговий центр" },
  { key: "school", emoji: "🏫", label: "Школа" },
  { key: "amusement-park", emoji: "🎡", label: "Парк атракціонів" },
  { key: "beach", emoji: "🏖️", label: "Пляж" },
];

export interface CarsPoint {
  x: number;
  y: number;
}

// A screen-absolute cardinal direction, NOT relative to the car's own
// current heading ("turn left/right like a steering wheel" was the
// original design — see git history — but it meant the same physical pad
// button could stop being the visually-obvious choice once the car had
// already turned once, which read as "the wrong button gets accepted/
// rejected" to anyone driving from the map rather than mentally tracking
// their own relative orientation; preschoolers definitely can't do that
// mental tracking, so every direction here — the sign, the pad, and the
// required input, both mid-block and at a turn — is always just "which
// way does the road visibly go", full stop).
export type TurnDirection = "up" | "right" | "down" | "left";

// headingToCardinal converts a heading in radians (always an exact
// multiple of 90° by construction — see buildRoad) to the absolute
// direction it points on screen.
export function headingToCardinal(headingRad: number): TurnDirection {
  const deg = Math.round((headingRad * 180) / Math.PI);
  const normalized = ((deg % 360) + 360) % 360;
  if (normalized === 270) return "up";
  if (normalized === 90) return "down";
  if (normalized === 180) return "left";
  return "right";
}

// Maps a route-wide progress value (0 at the parking lot, 1 at the
// destination) onto a specific straight segment + local t, so the driving
// stage only ever has to track one number.
function segmentAt(waypoints: CarsPoint[], t: number): { from: CarsPoint; to: CarsPoint; localT: number } {
  const segmentCount = waypoints.length - 1;
  const globalT = Math.min(1, Math.max(0, t)) * segmentCount;
  const index = Math.min(segmentCount - 1, Math.floor(globalT));
  return { from: waypoints[index], to: waypoints[index + 1], localT: globalT - index };
}

export function pointAtT(waypoints: CarsPoint[], t: number): CarsPoint {
  const { from, to, localT } = segmentAt(waypoints, t);
  return { x: from.x + (to.x - from.x) * localT, y: from.y + (to.y - from.y) * localT };
}

export function tangentAngleAtT(waypoints: CarsPoint[], t: number): number {
  const { from, to } = segmentAt(waypoints, t);
  return Math.atan2(to.y - from.y, to.x - from.x);
}

// A plain straight-line polyline through every waypoint — unlike a smoothed
// Catmull-Rom trail (preschool-ui/src/game-map.tsx's decorative dashboard
// path), this game wants a real city-block street: straight runs meeting at
// sharp corners, per docs/preschool/games/cars.md, not a continuously
// curving line.
export function waypointsToPathD(waypoints: CarsPoint[]): string {
  if (waypoints.length === 0) return "";
  return `M ${waypoints[0].x} ${waypoints[0].y} ` + waypoints.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
}

export interface CarsRouteTurn {
  t: number;
  direction: TurnDirection;
}

export interface CarsRoute {
  destination: CarsDestination;
  waypoints: CarsPoint[];
  turns: CarsRouteTurn[];
}

// How many intersections a round's road has — 3-5 keeps a round short
// enough for a preschooler's attention span while still reading as a real
// trip with more than one decision point.
const TURN_COUNT_RANGE = [3, 5] as const;

// One "block" of road between intersections.
const SEGMENT_LENGTH = 130;

// Chance any given intersection is a real left/right turn rather than a
// "continue straight" crossing — per the brief, the road mostly runs
// straight, turning only sometimes, not zig-zagging at every block.
const TURN_PROBABILITY = 0.55;

// Internal-only: which way to rotate the CURRENT heading when generating
// the road (avoiding a 180° reversal keeps every corner a clean, sensible
// right angle rather than the road doubling back on itself) — this is
// deliberately not the exported TurnDirection; only the RESULTING absolute
// cardinal (see headingToCardinal) is ever exposed to the rest of the game.
type RelativeTurn = "left" | "right" | "straight";

function randomRelativeTurn(): RelativeTurn {
  if (Math.random() >= TURN_PROBABILITY) return "straight";
  return Math.random() < 0.5 ? "left" : "right";
}

// A clean quarter turn either way — gives the road a real right-angle
// street corner instead of a gentle bend.
function applyRelativeTurn(headingRad: number, turn: RelativeTurn): number {
  if (turn === "left") return headingRad - Math.PI / 2;
  if (turn === "right") return headingRad + Math.PI / 2;
  return headingRad;
}

// A city-block road: mostly straight SEGMENT_LENGTH runs, with a sharp
// ~90° corner wherever a turn is rolled. Starts heading "up" the map.
// Returns turnCount+2 waypoints (start + one per intersection + the final
// destination) and exactly turnCount directions, one per intersection —
// each the absolute cardinal (see headingToCardinal) the road actually
// points along immediately after that waypoint, so a sign/prompt can never
// disagree with what's actually drawn.
function buildRoad(turnCount: number): { waypoints: CarsPoint[]; directions: TurnDirection[] } {
  const waypoints: CarsPoint[] = [{ x: 0, y: 0 }];
  let heading = -Math.PI / 2;
  let point = waypoints[0];

  // One fixed straight block out of the parking lot before the first
  // decision — the child's first turn prompt is a real intersection after
  // driving a block, not an instant fork right at the lot's exit.
  point = { x: point.x + Math.cos(heading) * SEGMENT_LENGTH, y: point.y + Math.sin(heading) * SEGMENT_LENGTH };
  waypoints.push(point);

  const directions: TurnDirection[] = [];
  for (let i = 0; i < turnCount; i++) {
    heading = applyRelativeTurn(heading, randomRelativeTurn());
    directions.push(headingToCardinal(heading));
    point = { x: point.x + Math.cos(heading) * SEGMENT_LENGTH, y: point.y + Math.sin(heading) * SEGMENT_LENGTH };
    waypoints.push(point);
  }
  return { waypoints, directions };
}

// The turn walk is symmetric (left/right equally likely), so a route can
// occasionally net sideways or even backward instead of toward the
// destination — fine for the turns themselves, but the destination marker
// should always read as "up ahead", not beside or behind the start. Reroll
// (bounded) until the start-to-destination vertical rise clears this floor;
// see cars-game.tsx's own per-round scale, which uses this rise to make the
// destination land at a specific screen height.
const MIN_NET_RISE = SEGMENT_LENGTH * 2;
const MAX_ROUTE_ATTEMPTS = 30;

// One random round's road — see docs/preschool/games/cars.md §7 for why
// this is one single generated path per round rather than a real branching
// road network.
export function generateCarsRoute(destinations: readonly CarsDestination[] = DESTINATIONS): CarsRoute {
  const destination = destinations[Math.floor(Math.random() * destinations.length)];
  let waypoints: CarsPoint[] = [];
  let directions: TurnDirection[] = [];
  for (let attempt = 0; attempt < MAX_ROUTE_ATTEMPTS; attempt++) {
    const turnCount = randomInt(...TURN_COUNT_RANGE);
    const built = buildRoad(turnCount);
    waypoints = built.waypoints;
    directions = built.directions;
    const netRise = waypoints[0].y - waypoints[waypoints.length - 1].y;
    if (netRise >= MIN_NET_RISE) break;
  }
  const turns: CarsRouteTurn[] = directions.map((direction, i) => ({ t: (i + 1) / (waypoints.length - 1), direction }));
  return { destination, waypoints, turns };
}
