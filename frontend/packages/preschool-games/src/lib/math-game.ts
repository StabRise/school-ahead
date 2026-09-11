// Pure question/answer generation for the math-runner minigame — see
// docs/preschool/games/multiplication.md. Kept separate from math-game.tsx
// so the generator (range per operation/level, distractor plausibility,
// no-duplicate-choices) is covered by vitest without rendering anything,
// same split as lib/reading-game.ts's selectLevel.
//
// The game covers five arithmetic operations, each with its own level
// ladder (see the *_BY_LEVEL tables below) — chosen client-side and
// persisted in stores/math-game-store.ts.

export type Operation = "count" | "add" | "subtract" | "multiply" | "divide";

// Order matches the settings panel's operation picker.
export const OPERATIONS: Operation[] = ["count", "add", "subtract", "multiply", "divide"];
export const DEFAULT_OPERATION: Operation = "multiply";

export const MIN_LEVEL = 1;
// "count" only has 3 rungs (0-3 / 0-5 / 0-10); the other four operations
// have 5.
export const MAX_LEVEL_BY_OPERATION: Record<Operation, number> = {
  count: 3,
  add: 5,
  subtract: 5,
  multiply: 5,
  divide: 5,
};
export const DEFAULT_LEVEL = 5;

// A run's Diamond only pays out on clearing all of these (see
// useDiamondMilestoneReward's "level" mode in math-game.tsx), so this is
// also "how many examples the child needs to solve for a Diamond".
export const QUESTION_COUNT = 10;

// The hotbar's size is a player-configurable setting (see
// stores/math-game-store.ts's choiceCount, chosen in math-game.tsx's
// settings panel) rather than a fixed constant —
// this is just its allowed range and default. At low levels the answer
// range can be too small to fill a full hotbar (e.g. "count" level 1 only
// has 4 possible answers: 0-3) — buildChoiceSet below shrinks the actual
// choice count for that question rather than padding with impossible
// numbers or repeats.
export const MIN_CHOICE_COUNT = 6;
export const MAX_CHOICE_COUNT = 10;
export const DEFAULT_CHOICE_COUNT = 8;

// Different critter each round ("різні звірята") but every emoji within one
// question's cluster is the same kind ("у прикладі всі однакові") — see
// generateCountQuestion.
export const COUNT_ANIMAL_EMOJIS = ["🦊", "🐰", "🐻", "🐱", "🐶", "🐼", "🐸", "🐷", "🐵", "🦁"];

export interface GameQuestion {
  operation: Operation;
  a: number;
  // Unused (0) for "count", which only has one operand.
  b: number;
  answer: number;
  // Set only for "count" — which critter the cluster of `a` emoji is made
  // of (all emoji in one question are this same kind).
  emoji?: string;
  choices: number[];
  correctIndex: number;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function clampLevel(operation: Operation, level: number): number {
  const max = MAX_LEVEL_BY_OPERATION[operation];
  return Math.min(Math.max(Math.round(level), MIN_LEVEL), max);
}

// --- Level ladders -----------------------------------------------------
// Each table maps level -> the bound that level allows. Levels are 1-indexed
// to match the settings UI.

// Shared by multiply and divide: the factor/quotient range widens from a
// couple of small tables (level 1) up to the full 2-10 table (level 5).
const FACTOR_MIN = 2;
const MULTIPLY_MAX_FACTOR_BY_LEVEL: Record<number, number> = { 1: 3, 2: 4, 3: 6, 4: 8, 5: 10 };

// "Найбільше число в прикладі" (the largest number among the operands and
// the answer) stays under this bound — for addition the sum is always that
// largest number (since both addends are positive and smaller than it), and
// for subtraction the minuend plays that role. Addition starts a notch
// easier than subtraction at level 1 (3 vs 4) — separate tables so that can
// diverge, even though every other level currently matches.
const ADD_MAX_BY_LEVEL: Record<number, number> = { 1: 3, 2: 5, 3: 10, 4: 20, 5: 100 };
const SUBTRACT_MAX_BY_LEVEL: Record<number, number> = { 1: 4, 2: 5, 3: 10, 4: 20, 5: 100 };

const COUNT_MIN = 0;
const COUNT_MAX_BY_LEVEL: Record<number, number> = { 1: 3, 2: 5, 3: 10 };

// --- Distractor generation ----------------------------------------------
// "Logical" wrong answers per docs/preschool/games/multiplication.md §4:
// mistakes a child actually makes (off-by-one on an operand, a forgotten
// operand, adding instead of subtracting, ...) rather than a uniformly
// random number — plus, as a broader net, any in-range number sharing the
// correct answer's last digit.

function buildDistractors(correct: number, logicalCandidates: number[], rangeMin: number, rangeMax: number, count: number): number[] {
  const candidates = new Set(
    logicalCandidates.filter((n) => Number.isInteger(n) && n !== correct && n >= rangeMin && n <= rangeMax),
  );

  const lastDigit = ((correct % 10) + 10) % 10;
  for (let n = rangeMin; n <= rangeMax; n++) {
    if (n % 10 === lastDigit) candidates.add(n);
  }
  candidates.delete(correct);

  let chosen = shuffle([...candidates]).slice(0, count);
  if (chosen.length < count) {
    const used = new Set([correct, ...chosen]);
    const pool: number[] = [];
    for (let n = rangeMin; n <= rangeMax; n++) if (!used.has(n)) pool.push(n);
    chosen = [...chosen, ...shuffle(pool).slice(0, count - chosen.length)];
  }
  return chosen;
}

// Choices are sorted ascending (not shuffled) so the hotbar reads like a
// number line — no numbered shortcut labels needed, the slots' own order is
// the hint. `requestedCount` is the player-configured choiceCount, but it's
// clamped down to however many distinct in-range numbers actually exist
// (see MIN_CHOICE_COUNT's doc comment above) — never padded with
// out-of-range or duplicate numbers just to hit the requested size.
function buildChoiceSet(
  correct: number,
  logicalCandidates: number[],
  rangeMin: number,
  rangeMax: number,
  requestedCount: number,
): { choices: number[]; correctIndex: number } {
  const rangeSize = rangeMax - rangeMin + 1;
  const choiceCount = Math.max(2, Math.min(requestedCount, rangeSize));
  const distractors = buildDistractors(correct, logicalCandidates, rangeMin, rangeMax, choiceCount - 1);
  const choices = [correct, ...distractors].sort((x, y) => x - y);
  return { choices, correctIndex: choices.indexOf(correct) };
}

// --- Per-operation question generation ----------------------------------

function generateMultiplyQuestion(level: number, choiceCount: number): GameQuestion {
  const maxFactor = MULTIPLY_MAX_FACTOR_BY_LEVEL[level];
  const a = randomInt(FACTOR_MIN, maxFactor);
  const b = randomInt(FACTOR_MIN, maxFactor);
  const answer = a * b;

  const logical: number[] = [];
  for (const [na, nb] of [
    [a - 1, b],
    [a + 1, b],
    [a, b - 1],
    [a, b + 1],
  ]) {
    if (na >= FACTOR_MIN && na <= maxFactor && nb >= FACTOR_MIN && nb <= maxFactor) logical.push(na * nb);
  }
  logical.push(answer - a, answer + a, answer - b, answer + b);

  const { choices, correctIndex } = buildChoiceSet(answer, logical, FACTOR_MIN * FACTOR_MIN, maxFactor * maxFactor, choiceCount);
  return { operation: "multiply", a, b, answer, choices, correctIndex };
}

function generateDivideQuestion(level: number, choiceCount: number): GameQuestion {
  const maxFactor = MULTIPLY_MAX_FACTOR_BY_LEVEL[level];
  const b = randomInt(FACTOR_MIN, maxFactor); // divisor
  const answer = randomInt(FACTOR_MIN, maxFactor); // quotient — kept exact, so a = b * answer
  const a = b * answer;

  // Mistaking the divisor for the quotient, or landing on a neighboring
  // quotient.
  const logical = [answer - 1, answer + 1, answer - 2, answer + 2, b];

  const { choices, correctIndex } = buildChoiceSet(answer, logical, FACTOR_MIN, maxFactor, choiceCount);
  return { operation: "divide", a, b, answer, choices, correctIndex };
}

function generateAddQuestion(level: number, choiceCount: number): GameQuestion {
  const max = ADD_MAX_BY_LEVEL[level];
  const sum = randomInt(2, max);
  const a = randomInt(1, sum - 1);
  const b = sum - a;
  const answer = sum;

  // Forgetting an addend entirely, off-by-one/two, or subtracting instead
  // of adding.
  const logical = [a, b, Math.abs(a - b), answer - 1, answer + 1, answer - 2, answer + 2];

  const { choices, correctIndex } = buildChoiceSet(answer, logical, 0, max, choiceCount);
  return { operation: "add", a, b, answer, choices, correctIndex };
}

function generateSubtractQuestion(level: number, choiceCount: number): GameQuestion {
  const max = SUBTRACT_MAX_BY_LEVEL[level];
  const a = randomInt(1, max); // larger number
  const b = randomInt(0, a); // smaller number, subtracted from a
  const answer = a - b;

  // Adding instead of subtracting, forgetting to subtract at all, or
  // off-by-one/two.
  const logical = [a + b, a, answer - 1, answer + 1, answer - 2, answer + 2];

  const { choices, correctIndex } = buildChoiceSet(answer, logical, 0, max, choiceCount);
  return { operation: "subtract", a, b, answer, choices, correctIndex };
}

function generateCountQuestion(level: number, choiceCount: number): GameQuestion {
  const max = COUNT_MAX_BY_LEVEL[level];
  const answer = randomInt(COUNT_MIN, max);
  const emoji = COUNT_ANIMAL_EMOJIS[Math.floor(Math.random() * COUNT_ANIMAL_EMOJIS.length)];

  const logical = [answer - 1, answer + 1, answer - 2, answer + 2];

  const { choices, correctIndex } = buildChoiceSet(answer, logical, COUNT_MIN, max, choiceCount);
  return { operation: "count", a: answer, b: 0, answer, emoji, choices, correctIndex };
}

export function generateQuestion(
  operation: Operation = DEFAULT_OPERATION,
  level: number = DEFAULT_LEVEL,
  choiceCount: number = DEFAULT_CHOICE_COUNT,
): GameQuestion {
  const clampedLevel = clampLevel(operation, level);
  switch (operation) {
    case "count":
      return generateCountQuestion(clampedLevel, choiceCount);
    case "add":
      return generateAddQuestion(clampedLevel, choiceCount);
    case "subtract":
      return generateSubtractQuestion(clampedLevel, choiceCount);
    case "divide":
      return generateDivideQuestion(clampedLevel, choiceCount);
    case "multiply":
    default:
      return generateMultiplyQuestion(clampedLevel, choiceCount);
  }
}

export function buildSession(
  operation: Operation = DEFAULT_OPERATION,
  level: number = DEFAULT_LEVEL,
  choiceCount: number = DEFAULT_CHOICE_COUNT,
): GameQuestion[] {
  return Array.from({ length: QUESTION_COUNT }, () => generateQuestion(operation, level, choiceCount));
}
