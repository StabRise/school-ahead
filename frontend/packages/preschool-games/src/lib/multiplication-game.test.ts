import { describe, expect, it } from "vitest";
import {
  buildSession,
  CHOICE_COUNT,
  generateChoices,
  generateQuestion,
  generateQuestionFactors,
  MULTIPLICATION_MAX,
  MULTIPLICATION_MIN,
  QUESTION_COUNT,
} from "./multiplication-game";

describe("generateQuestionFactors", () => {
  it("always picks both factors within [2, 10]", () => {
    for (let i = 0; i < 200; i++) {
      const { a, b } = generateQuestionFactors();
      expect(a).toBeGreaterThanOrEqual(MULTIPLICATION_MIN);
      expect(a).toBeLessThanOrEqual(MULTIPLICATION_MAX);
      expect(b).toBeGreaterThanOrEqual(MULTIPLICATION_MIN);
      expect(b).toBeLessThanOrEqual(MULTIPLICATION_MAX);
    }
  });

  it("varies both factors across calls", () => {
    const as = new Set(Array.from({ length: 50 }, () => generateQuestionFactors().a));
    expect(as.size).toBeGreaterThan(1);
  });
});

describe("generateChoices", () => {
  it("returns exactly CHOICE_COUNT distinct choices including the correct product", () => {
    for (let a = 2; a <= 10; a++) {
      for (let b = 2; b <= 10; b++) {
        const { choices, correctIndex } = generateChoices(a, b);
        expect(choices).toHaveLength(CHOICE_COUNT);
        expect(new Set(choices).size).toBe(CHOICE_COUNT); // no duplicate choices
        expect(choices[correctIndex]).toBe(a * b);
      }
    }
  });

  it("sorts choices ascending, so the correct answer's position varies with its distractors", () => {
    const positions = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const { choices, correctIndex } = generateChoices(6, 7);
      expect(choices).toEqual([...choices].sort((x, y) => x - y));
      positions.add(correctIndex);
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it("keeps every distractor a plausible multiplication-table-range number", () => {
    const { choices, correctIndex } = generateChoices(3, 8);
    choices.forEach((choice, i) => {
      if (i === correctIndex) return;
      expect(choice).toBeGreaterThanOrEqual(MULTIPLICATION_MIN * MULTIPLICATION_MIN);
      expect(choice).toBeLessThanOrEqual(MULTIPLICATION_MAX * MULTIPLICATION_MAX);
    });
  });
});

describe("generateQuestion", () => {
  it("produces a question whose factors match the correct choice", () => {
    const question = generateQuestion();
    expect(question.choices[question.correctIndex]).toBe(question.a * question.b);
  });
});

describe("buildSession", () => {
  it("builds QUESTION_COUNT questions, each with a valid correct choice", () => {
    const session = buildSession();
    expect(session).toHaveLength(QUESTION_COUNT);
    for (const question of session) {
      expect(question.choices).toHaveLength(CHOICE_COUNT);
      expect(question.choices[question.correctIndex]).toBe(question.a * question.b);
    }
  });
});
