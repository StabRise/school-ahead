import { describe, expect, it } from "vitest";
import { snapToSurface } from "./surface";

describe("snapToSurface", () => {
  it("floor: keeps a small y offset (a tutor's default_position_y nudge), the free spin, and the tilt", () => {
    const result = snapToSurface("floor", [1.5, 0.2, -2], [0.3, 1.1, 0.4]);
    expect(result).toEqual({ position: [1.5, 0.2, -2], facingY: 1.1, tiltX: 0.3, tiltZ: 0.4 });
  });

  it("floor: clamps an oversized y offset to a little move", () => {
    expect(snapToSurface("floor", [0, 0.8, 0], [0, 0, 0]).position[1]).toBe(0.5);
    expect(snapToSurface("floor", [0, -0.8, 0], [0, 0, 0]).position[1]).toBe(-0.5);
  });

  it("ceiling: keeps a small y offset near the ceiling height, the free spin, and the tilt", () => {
    const result = snapToSurface("ceiling", [1.5, 3.8, -2], [0.3, 1.1, 0.4]);
    expect(result).toEqual({ position: [1.5, 3.8, -2], facingY: 1.1, tiltX: 0.3, tiltZ: 0.4 });
  });

  it("ceiling: clamps an oversized y offset to a little move", () => {
    expect(snapToSurface("ceiling", [0, 5, 0], [0, 0, 0]).position[1]).toBe(4.5);
    expect(snapToSurface("ceiling", [0, -5, 0], [0, 0, 0]).position[1]).toBe(3.5);
  });

  it("floor: clamps x/z within the room bounds so it can't be dragged through a wall", () => {
    expect(snapToSurface("floor", [50, 0, 0], [0, 0, 0]).position).toEqual([4, 0, 0]);
    expect(snapToSurface("floor", [-50, 0, 0], [0, 0, 0]).position).toEqual([-4, 0, 0]);
    expect(snapToSurface("floor", [0, 0, 50], [0, 0, 0]).position).toEqual([0, 0, 4]);
    expect(snapToSurface("floor", [0, 0, -50], [0, 0, 0]).position).toEqual([0, 0, -4]);
  });

  it("ceiling: clamps x/z within the room bounds so it can't be dragged through a wall", () => {
    expect(snapToSurface("ceiling", [50, 4, 0], [0, 0, 0]).position).toEqual([4, 4, 0]);
    expect(snapToSurface("ceiling", [0, 4, -50], [0, 0, 0]).position).toEqual([0, 4, -4]);
  });

  it("wall: snaps to the nearest wall, faces into the room, and keeps the tutor's x/z tilt separately", () => {
    // Nearest to the back wall (z = -4).
    expect(snapToSurface("wall", [0, 1, -3.5], [0.2, 0, 0.4])).toEqual({
      position: [0, 1, -3.98],
      facingY: 0,
      tiltX: 0.2,
      tiltZ: 0.4,
    });
    // Nearest to the left wall (x = -4).
    expect(snapToSurface("wall", [-3.6, 1, 0], [0, 0, 0])).toEqual({
      position: [-3.98, 1, 0],
      facingY: Math.PI / 2,
      tiltX: 0,
      tiltZ: 0,
    });
    // Nearest to the right wall (x = 4).
    expect(snapToSurface("wall", [3.6, 1, 0], [0, 0, 0])).toEqual({
      position: [3.98, 1, 0],
      facingY: -Math.PI / 2,
      tiltX: 0,
      tiltZ: 0,
    });
    // Nearest to the front wall (z = 4).
    expect(snapToSurface("wall", [0, 1, 3.5], [0, 0, 0])).toEqual({
      position: [0, 1, 3.98],
      facingY: Math.PI,
      tiltX: 0,
      tiltZ: 0,
    });
  });

  it("wall: clamps height between the floor and the ceiling", () => {
    expect(snapToSurface("wall", [0, -5, -3.9], [0, 0, 0]).position[1]).toBe(0);
    expect(snapToSurface("wall", [0, 50, -3.9], [0, 0, 0]).position[1]).toBe(4);
  });

  it("wall: clamps the in-plane axis within the room bounds", () => {
    expect(snapToSurface("wall", [50, 1, -3.9], [0, 0, 0]).position[0]).toBe(4);
  });

  it("wall: keeps a significant x tilt (e.g. 90°, to stand a window up) without disturbing the wall facing", () => {
    // A window authored lying flat needs a 90° x tilt to stand up. Facing
    // should still be exactly the left wall's angle, unaffected by the
    // tilt — this is the case a single merged rotation triple gets wrong.
    const result = snapToSurface("wall", [-3.6, 1, 0], [Math.PI / 2, 0, 0]);
    expect(result.facingY).toBe(Math.PI / 2);
    expect(result.tiltX).toBe(Math.PI / 2);
    expect(result.tiltZ).toBe(0);
  });

  it("floor: keeps a large item's edge, not just its pivot, inside the room", () => {
    // A 2x2 footprint centered on the pivot — dragging the pivot to (3.5, 3.5)
    // would otherwise leave the item half-outside the room's (4, 4) corner.
    const footprint = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
    expect(snapToSurface("floor", [3.5, 0, 3.5], [0, 0, 0], footprint).position).toEqual([3, 0, 3]);
    expect(snapToSurface("floor", [-3.5, 0, -3.5], [0, 0, 0], footprint).position).toEqual([-3, 0, -3]);
  });

  it("floor: honors an off-center pivot's asymmetric reach on each side", () => {
    // A pivot near one edge of its mesh (e.g. an off-center model origin)
    // reaches 0.2 behind it but 1.8 ahead — the far side should hit the
    // room bound sooner than a symmetric footprint of the same total size.
    const footprint = { minX: -0.2, maxX: 1.8, minZ: -0.2, maxZ: 1.8 };
    expect(snapToSurface("floor", [10, 0, 0], [0, 0, 0], footprint).position[0]).toBeCloseTo(2.2);
    expect(snapToSurface("floor", [-10, 0, 0], [0, 0, 0], footprint).position[0]).toBeCloseTo(-3.8);
  });

  it("wall: keeps a wide item's edge within the wall's width", () => {
    const footprint = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
    expect(snapToSurface("wall", [3.9, 1, -3.9], [0, 0, 0], footprint).position[0]).toBe(3);
  });
});
