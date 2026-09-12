import { describe, expect, it } from "vitest";
import {
  buildSession,
  clampLevel,
  DEFAULT_CHOICE_COUNT,
  DEFAULT_LEVEL,
  generateQuestion,
  MAX_CHOICE_COUNT,
  MAX_LEVEL_BY_OPERATION,
  MIN_CHOICE_COUNT,
  MIN_LEVEL,
  OPERATIONS,
  QUESTION_COUNT,
  type Operation,
} from "./math-game";

function allLevels(operation: Operation): number[] {
  const max = MAX_LEVEL_BY_OPERATION[operation];
  return Array.from({ length: max - MIN_LEVEL + 1 }, (_, i) => MIN_LEVEL + i);
}

describe("clampLevel", () => {
  it("clamps below MIN_LEVEL up to MIN_LEVEL", () => {
    expect(clampLevel("multiply", 0)).toBe(MIN_LEVEL);
    expect(clampLevel("multiply", -5)).toBe(MIN_LEVEL);
  });

  it("clamps above an operation's max level down to that max", () => {
    expect(clampLevel("count", 99)).toBe(MAX_LEVEL_BY_OPERATION.count);
    expect(clampLevel("multiply", 99)).toBe(MAX_LEVEL_BY_OPERATION.multiply);
  });
});

describe("generateQuestion", () => {
  for (const operation of OPERATIONS) {
    describe(operation, () => {
      it("produces a question whose answer matches the correct choice, at every level", () => {
        for (const level of allLevels(operation)) {
          for (let i = 0; i < 30; i++) {
            const question = generateQuestion(operation, level);
            expect(question.operation).toBe(operation);
            expect(question.choices[question.correctIndex]).toBe(question.answer);
          }
        }
      });

      it("returns distinct choices including the correct answer, with no duplicates", () => {
        for (const level of allLevels(operation)) {
          for (let i = 0; i < 30; i++) {
            const question = generateQuestion(operation, level);
            expect(new Set(question.choices).size).toBe(question.choices.length);
          }
        }
      });

      it("sorts choices ascending", () => {
        for (let i = 0; i < 20; i++) {
          const { choices } = generateQuestion(operation, MAX_LEVEL_BY_OPERATION[operation]);
          expect(choices).toEqual([...choices].sort((x, y) => x - y));
        }
      });

      it("honors any choiceCount in the configurable MIN_CHOICE_COUNT-MAX_CHOICE_COUNT range when the level's answer range is large enough", () => {
        // Only the top level of each operation is guaranteed to have enough
        // distinct possible answers to fill every requested choiceCount —
        // low levels intentionally shrink the hotbar (see buildChoiceSet).
        const level = MAX_LEVEL_BY_OPERATION[operation];
        for (let choiceCount = MIN_CHOICE_COUNT; choiceCount <= MAX_CHOICE_COUNT; choiceCount++) {
          const question = generateQuestion(operation, level, choiceCount);
          expect(question.choices).toHaveLength(operation === "divide" ? Math.min(choiceCount, 9) : choiceCount);
        }
      });

      it("shrinks the hotbar instead of padding when a low level's answer range is too small", () => {
        const level = MIN_LEVEL;
        const question = generateQuestion(operation, level, MAX_CHOICE_COUNT);
        expect(question.choices.length).toBeLessThanOrEqual(MAX_CHOICE_COUNT);
        expect(question.choices.length).toBeGreaterThanOrEqual(2);
        expect(new Set(question.choices).size).toBe(question.choices.length);
      });
    });
  }

  it("count questions carry an emoji and a==answer (single-operand count)", () => {
    const question = generateQuestion("count", 3);
    expect(question.emoji).toBeTruthy();
    expect(question.a).toBe(question.answer);
    expect(question.b).toBe(0);
  });

  it("count level 1 alone can answer 0; every level above it always shows at least 1 animal", () => {
    const level1Answers = new Set<number>();
    for (let i = 0; i < 50; i++) level1Answers.add(generateQuestion("count", 1).answer);
    expect(level1Answers.has(0)).toBe(true);

    for (const level of allLevels("count").filter((l) => l > 1)) {
      for (let i = 0; i < 30; i++) {
        expect(generateQuestion("count", level).answer).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("count only varies animal size from level 4 up, one size per animal in the cluster", () => {
    for (const level of [1, 2, 3]) {
      for (let i = 0; i < 10; i++) {
        expect(generateQuestion("count", level).emojiSizes).toBeUndefined();
      }
    }
    for (const level of allLevels("count").filter((l) => l >= 4)) {
      for (let i = 0; i < 10; i++) {
        const question = generateQuestion("count", level);
        expect(question.emojiSizes).toHaveLength(question.answer);
        for (const size of question.emojiSizes ?? []) {
          expect(size).toBeGreaterThan(0);
        }
      }
    }
  });

  it("never repeats the immediately previous count example (same answer and animal)", () => {
    let previous = generateQuestion("count", 1);
    for (let i = 0; i < 100; i++) {
      const next = generateQuestion("count", 1, DEFAULT_CHOICE_COUNT, previous);
      expect(next.answer === previous.answer && next.emoji === previous.emoji).toBe(false);
      previous = next;
    }
  });

  it("add level 1 caps the largest number in the example at 3 (a notch easier than subtract's 4)", () => {
    for (let i = 0; i < 50; i++) {
      const question = generateQuestion("add", 1);
      expect(Math.max(question.a, question.b, question.answer)).toBeLessThanOrEqual(3);
    }
    for (let i = 0; i < 50; i++) {
      const question = generateQuestion("subtract", 1);
      expect(Math.max(question.a, question.b, question.answer)).toBeLessThanOrEqual(4);
    }
  });

  it("subtract questions never go negative (larger minus smaller)", () => {
    for (let i = 0; i < 50; i++) {
      const question = generateQuestion("subtract", 5);
      expect(question.a).toBeGreaterThanOrEqual(question.b);
      expect(question.answer).toBeGreaterThanOrEqual(0);
    }
  });

  it("divide questions are always exact (a === b * answer)", () => {
    for (let i = 0; i < 50; i++) {
      const question = generateQuestion("divide", 5);
      expect(question.a).toBe(question.b * question.answer);
    }
  });

  it("defaults to multiply at DEFAULT_LEVEL (the full 2-10 table) when called with no arguments", () => {
    expect(DEFAULT_LEVEL).toBe(MAX_LEVEL_BY_OPERATION.multiply);
    const factors = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const question = generateQuestion();
      expect(question.operation).toBe("multiply");
      factors.add(question.a);
      factors.add(question.b);
    }
    // Would never happen at level 1 (factors capped at 3) — confirms the
    // default really is the top of the ladder, not a low starting rung.
    expect([...factors].some((f) => f > 4)).toBe(true);
  });
});

describe("buildSession", () => {
  it("builds QUESTION_COUNT questions for every operation, each with a valid correct choice", () => {
    for (const operation of OPERATIONS) {
      const session = buildSession(operation, MAX_LEVEL_BY_OPERATION[operation], DEFAULT_CHOICE_COUNT);
      expect(session).toHaveLength(QUESTION_COUNT);
      for (const question of session) {
        expect(question.choices[question.correctIndex]).toBe(question.answer);
      }
    }
  });
});
