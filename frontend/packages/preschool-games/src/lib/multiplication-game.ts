// Pure question/answer generation for the multiplication-table minigame —
// see docs/preschool/games/multiplication.md. Kept separate from
// multiplication-game.tsx so the generator (range, distractor plausibility,
// no-duplicate-choices) is covered by vitest without rendering anything,
// same split as lib/reading-game.ts's selectLevel.

export const MULTIPLICATION_MIN = 2;
export const MULTIPLICATION_MAX = 10;
export const QUESTION_COUNT = 15;

// The hotbar's size is a player-configurable setting (see
// stores/multiplication-game-store.ts's choiceCount, chosen in
// multiplication-game.tsx's settings panel) rather than a fixed constant —
// this is just its allowed range and default.
export const MIN_CHOICE_COUNT = 6;
export const MAX_CHOICE_COUNT = 10;
export const DEFAULT_CHOICE_COUNT = 8;

export interface MultiplicationQuestion {
  a: number;
  b: number;
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

function randomFactor(): number {
  return MULTIPLICATION_MIN + Math.floor(Math.random() * (MULTIPLICATION_MAX - MULTIPLICATION_MIN + 1));
}

export function generateQuestionFactors(): { a: number; b: number } {
  return { a: randomFactor(), b: randomFactor() };
}

const MIN_PRODUCT = MULTIPLICATION_MIN * MULTIPLICATION_MIN;
const MAX_PRODUCT = MULTIPLICATION_MAX * MULTIPLICATION_MAX;

// "Logical" wrong answers per docs/preschool/games/multiplication.md §4:
// results from an off-by-one factor, and numbers sharing the correct
// product's last digit — both are mistakes a child actually makes, unlike a
// uniformly random number.
function candidateDistractors(a: number, b: number, correct: number): number[] {
  const candidates = new Set<number>();

  for (const [na, nb] of [
    [a - 1, b],
    [a + 1, b],
    [a, b - 1],
    [a, b + 1],
  ]) {
    if (na >= MULTIPLICATION_MIN && na <= MULTIPLICATION_MAX && nb >= MULTIPLICATION_MIN && nb <= MULTIPLICATION_MAX) {
      candidates.add(na * nb);
    }
  }

  candidates.add(correct - a);
  candidates.add(correct + a);
  candidates.add(correct - b);
  candidates.add(correct + b);

  const lastDigit = correct % 10;
  for (let n = MIN_PRODUCT; n <= MAX_PRODUCT; n++) {
    if (n % 10 === lastDigit) candidates.add(n);
  }

  candidates.delete(correct);
  return [...candidates].filter((n) => n >= MIN_PRODUCT && n <= MAX_PRODUCT);
}

// Fills out to `count` distinct, non-correct numbers in range when the
// "logical" pool above came up short — keeps the hotbar at the requested
// choiceCount regardless.
function padDistractors(existing: number[], correct: number, count: number): number[] {
  const used = new Set([correct, ...existing]);
  const pool: number[] = [];
  for (let n = MIN_PRODUCT; n <= MAX_PRODUCT; n++) {
    if (!used.has(n)) pool.push(n);
  }
  return [...existing, ...shuffle(pool).slice(0, count - existing.length)];
}

// Choices are sorted ascending (not shuffled) so the hotbar reads like a
// number line — no numbered shortcut labels needed, the slots' own order is
// the hint. `choiceCount` is a player-configurable setting, MIN_CHOICE_COUNT
// to MAX_CHOICE_COUNT — see multiplication-game.tsx's settings panel.
export function generateChoices(
  a: number,
  b: number,
  choiceCount: number = DEFAULT_CHOICE_COUNT,
): { choices: number[]; correctIndex: number } {
  const correct = a * b;
  const distractorCount = choiceCount - 1;
  const logical = shuffle(candidateDistractors(a, b, correct)).slice(0, distractorCount);
  const distractors = logical.length < distractorCount ? padDistractors(logical, correct, distractorCount) : logical;
  const choices = [correct, ...distractors].sort((x, y) => x - y);
  return { choices, correctIndex: choices.indexOf(correct) };
}

export function generateQuestion(choiceCount: number = DEFAULT_CHOICE_COUNT): MultiplicationQuestion {
  const { a, b } = generateQuestionFactors();
  const { choices, correctIndex } = generateChoices(a, b, choiceCount);
  return { a, b, choices, correctIndex };
}

export function buildSession(choiceCount: number = DEFAULT_CHOICE_COUNT): MultiplicationQuestion[] {
  return Array.from({ length: QUESTION_COUNT }, () => generateQuestion(choiceCount));
}
