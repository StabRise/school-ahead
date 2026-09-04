import { describe, expect, it } from "vitest";
import { normalizeRotation, pickTopLayerAt, type HitTestLayer } from "./avatar-hit-test";

function squareLayer(overrides: Partial<HitTestLayer> = {}): HitTestLayer {
  return {
    itemId: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    scale: 1,
    naturalWidth: 100,
    naturalHeight: 100,
    sampleAlpha: null,
    ...overrides,
  };
}

describe("pickTopLayerAt", () => {
  it("ignores the body layer even when its box is hit", () => {
    const layers = [squareLayer({ itemId: null })];
    expect(pickTopLayerAt(layers, 50, 50)).toBeNull();
  });

  it("picks the topmost layer when both boxes are hit and neither has pixel data yet", () => {
    const layers = [squareLayer({ itemId: 1 }), squareLayer({ itemId: 2 })];
    expect(pickTopLayerAt(layers, 50, 50)).toBe(2);
  });

  it("falls through a transparent pixel on the top layer to the one underneath", () => {
    const layers = [
      squareLayer({ itemId: 1, sampleAlpha: () => 255 }),
      squareLayer({ itemId: 2, sampleAlpha: () => 0 }),
    ];
    expect(pickTopLayerAt(layers, 50, 50)).toBe(1);
  });

  it("misses entirely once every layer under the click is transparent or out of bounds", () => {
    const layers = [squareLayer({ itemId: 1, sampleAlpha: () => 0 })];
    expect(pickTopLayerAt(layers, 50, 50)).toBeNull();
  });

  it("respects offset — a click outside the moved item's box misses", () => {
    const layers = [squareLayer({ itemId: 1, offsetX: 40, offsetY: 0 })];
    expect(pickTopLayerAt(layers, 5, 50)).toBeNull();
    expect(pickTopLayerAt(layers, 90, 50)).toBe(1);
  });

  it("respects a non-square image's object-contain box, not the full canvas", () => {
    // A 200x100 image inside the 100x100 box draws as 100x50 (object-contain)
    // — a wide, short band (|y-50| <= 25).
    const layers = [squareLayer({ itemId: 1, naturalWidth: 200, naturalHeight: 100 })];
    expect(pickTopLayerAt(layers, 50, 60)).toBe(1);
    expect(pickTopLayerAt(layers, 50, 90)).toBeNull();
  });

  it("undoes rotation before testing bounds", () => {
    // The same wide/short band, rotated 90deg, becomes narrow/tall
    // (|x-50| <= 25 instead of |y-50| <= 25).
    const layers = [squareLayer({ itemId: 1, naturalWidth: 200, naturalHeight: 100, rotation: 90 })];
    expect(pickTopLayerAt(layers, 50, 90)).toBe(1);
    expect(pickTopLayerAt(layers, 90, 50)).toBeNull();
  });

  it("samples alpha at the pixel corresponding to the click, accounting for scale", () => {
    let sampledU = -1;
    let sampledV = -1;
    const layers = [
      squareLayer({
        itemId: 1,
        scale: 2,
        sampleAlpha: (u, v) => {
          sampledU = u;
          sampledV = v;
          return 255;
        },
      }),
    ];
    // Center of the box either way.
    pickTopLayerAt(layers, 50, 50);
    expect(sampledU).toBeCloseTo(0.5);
    expect(sampledV).toBeCloseTo(0.5);
  });
});

describe("normalizeRotation", () => {
  it("leaves values already in range untouched", () => {
    expect(normalizeRotation(45)).toBeCloseTo(45);
    expect(normalizeRotation(-90)).toBeCloseTo(-90);
    expect(normalizeRotation(180)).toBeCloseTo(180);
  });

  it("wraps values past a full turn back into (-180, 180]", () => {
    expect(normalizeRotation(270)).toBeCloseTo(-90);
    expect(normalizeRotation(-270)).toBeCloseTo(90);
    expect(normalizeRotation(400)).toBeCloseTo(40);
    expect(normalizeRotation(-400)).toBeCloseTo(-40);
  });
});
