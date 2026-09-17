import { describe, expect, it } from "vitest";
import { buildCarsAnswerChoices, DESTINATIONS, generateCarsEquation, generateCarsRoute, headingToCardinal } from "./cars-game";

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
        expect(["up", "right", "down", "left"]).toContain(turn.direction);
      }
    }
  });

  it("always nets a meaningful rise from start to destination (never sideways or backward)", () => {
    for (let i = 0; i < 30; i++) {
      const route = generateCarsRoute();
      const netRise = route.waypoints[0].y - route.waypoints[route.waypoints.length - 1].y;
      // Matches lib/cars-game.ts's own MIN_NET_RISE = SEGMENT_LENGTH * 2.
      expect(netRise).toBeGreaterThanOrEqual(260);
    }
  });

  it("connects waypoints with equal-length straight segments (a city block, not a curve)", () => {
    const route = generateCarsRoute();
    for (let i = 0; i < route.waypoints.length - 1; i++) {
      const length = segmentLength(segmentVector(route.waypoints[i], route.waypoints[i + 1]));
      expect(length).toBeCloseTo(130, 5);
    }
  });

  it("stores the exact absolute direction the road actually heads after each turn", () => {
    // This is the core promise the whole sign/pad/input system depends on
    // (see TurnDirection's own comment): a stored direction must always
    // match what's actually drawn, with no relative-to-heading indirection
    // for anything to disagree through.
    for (let i = 0; i < 30; i++) {
      const route = generateCarsRoute();
      for (let k = 0; k < route.turns.length; k++) {
        const after = segmentVector(route.waypoints[k + 1], route.waypoints[k + 2]);
        const afterHeading = Math.atan2(after.y, after.x);
        expect(headingToCardinal(afterHeading)).toBe(route.turns[k].direction);
      }
    }
  });

  it("keeps consecutive segments collinear when the direction repeats and perpendicular when it changes", () => {
    for (let i = 0; i < 30; i++) {
      const route = generateCarsRoute();
      for (let k = 0; k < route.turns.length; k++) {
        const before = segmentVector(route.waypoints[k], route.waypoints[k + 1]);
        const after = segmentVector(route.waypoints[k + 1], route.waypoints[k + 2]);
        const dot = before.x * after.x + before.y * after.y;
        const beforeCardinal = headingToCardinal(Math.atan2(before.y, before.x));
        if (beforeCardinal === route.turns[k].direction) {
          expect(dot).toBeCloseTo(130 * 130, 3);
        } else {
          expect(dot).toBeCloseTo(0, 3);
        }
      }
    }
  });

  it("gives each turn a `kind` matching the actual geometry — straight iff collinear, else the true left/right handedness", () => {
    // The driving stage's map-rotation and "go straight vs. turn" narration
    // (cars-game.tsx's CarsDrivingStage) key entirely off `kind`, so it has
    // to agree with the waypoints actually drawn, same promise the
    // `direction` test above makes for the absolute cardinal.
    for (let i = 0; i < 30; i++) {
      const route = generateCarsRoute();
      for (let k = 0; k < route.turns.length; k++) {
        const before = segmentVector(route.waypoints[k], route.waypoints[k + 1]);
        const after = segmentVector(route.waypoints[k + 1], route.waypoints[k + 2]);
        const beforeCardinal = headingToCardinal(Math.atan2(before.y, before.x));
        if (beforeCardinal === route.turns[k].direction) {
          expect(route.turns[k].kind).toBe("straight");
        } else {
          // Screen (y-down) cross product: positive = clockwise = right turn.
          const cross = before.x * after.y - before.y * after.x;
          expect(route.turns[k].kind).toBe(cross > 0 ? "right" : "left");
        }
      }
    }
  });
});
