import { describe, expect, it } from "vitest";
import { buildCarsAnswerChoices, DESTINATIONS, generateCarsEquation, generateCarsRoute } from "./cars-game";

describe("generateCarsEquation", () => {
  it("keeps total in [3,8] and subtract in [1,total-1]", () => {
    for (let i = 0; i < 50; i++) {
      const { total, subtract, answer } = generateCarsEquation();
      expect(total).toBeGreaterThanOrEqual(3);
      expect(total).toBeLessThanOrEqual(8);
      expect(subtract).toBeGreaterThanOrEqual(1);
      expect(subtract).toBeLessThanOrEqual(total - 1);
      expect(answer).toBe(total - subtract);
    }
  });

  it("never produces an answer of 0 or equal to total", () => {
    for (let i = 0; i < 50; i++) {
      const { total, answer } = generateCarsEquation();
      expect(answer).toBeGreaterThan(0);
      expect(answer).toBeLessThan(total);
    }
  });
});

describe("buildCarsAnswerChoices", () => {
  it("always includes the correct answer at correctIndex", () => {
    for (let answer = 0; answer <= 7; answer++) {
      const { choices, correctIndex } = buildCarsAnswerChoices(answer);
      expect(choices[correctIndex]).toBe(answer);
    }
  });

  it("sorts choices ascending with no duplicates", () => {
    const { choices } = buildCarsAnswerChoices(4);
    expect(choices).toEqual([...choices].sort((a, b) => a - b));
    expect(new Set(choices).size).toBe(choices.length);
  });

  it("never offers a negative choice", () => {
    for (let i = 0; i < 20; i++) {
      const { choices } = buildCarsAnswerChoices(1);
      for (const choice of choices) expect(choice).toBeGreaterThanOrEqual(0);
    }
  });
});

function segmentVector(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: b.x - a.x, y: b.y - a.y };
}

function segmentLength(v: { x: number; y: number }) {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

describe("generateCarsRoute", () => {
  it("picks a valid destination and produces an ascending turns list within [0,1]", () => {
    for (let i = 0; i < 30; i++) {
      const route = generateCarsRoute();
      expect(DESTINATIONS.some((d) => d.key === route.destination.key)).toBe(true);
      expect(route.turns.length).toBeGreaterThanOrEqual(3);
      expect(route.turns.length).toBeLessThanOrEqual(5);
      expect(route.waypoints.length).toBe(route.turns.length + 2);
      let previousT = -1;
      for (const turn of route.turns) {
        expect(turn.t).toBeGreaterThanOrEqual(0);
        expect(turn.t).toBeLessThanOrEqual(1);
        expect(turn.t).toBeGreaterThan(previousT);
        previousT = turn.t;
        expect(["left", "right", "straight"]).toContain(turn.direction);
      }
    }
  });

  it("connects waypoints with equal-length straight segments (a city block, not a curve)", () => {
    const route = generateCarsRoute();
    for (let i = 0; i < route.waypoints.length - 1; i++) {
      const length = segmentLength(segmentVector(route.waypoints[i], route.waypoints[i + 1]));
      expect(length).toBeCloseTo(130, 5);
    }
  });

  it("keeps consecutive segments collinear for a 'straight' turn and perpendicular for a real turn", () => {
    for (let i = 0; i < 30; i++) {
      const route = generateCarsRoute();
      for (let k = 0; k < route.turns.length; k++) {
        // Segment k runs waypoints[k] -> waypoints[k+1]; segment k+1 runs
        // waypoints[k+1] -> waypoints[k+2] — the turn at turns[k] is the
        // heading change between those two segments.
        const before = segmentVector(route.waypoints[k], route.waypoints[k + 1]);
        const after = segmentVector(route.waypoints[k + 1], route.waypoints[k + 2]);
        const dot = before.x * after.x + before.y * after.y;
        const cross = before.x * after.y - before.y * after.x;
        if (route.turns[k].direction === "straight") {
          expect(dot).toBeCloseTo(130 * 130, 3);
        } else {
          expect(dot).toBeCloseTo(0, 3);
          // Screen coords (y-down): heading += 90° ("right") rotates
          // (cosθ,sinθ) to (-sinθ,cosθ), giving a positive cross product;
          // heading -= 90° ("left") gives a negative one.
          if (route.turns[k].direction === "right") expect(cross).toBeGreaterThan(0);
          else expect(cross).toBeLessThan(0);
        }
      }
    }
  });
});
