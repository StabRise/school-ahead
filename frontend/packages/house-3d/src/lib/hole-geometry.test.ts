import { describe, expect, it } from "vitest";
import { buildPanelWithHoles, panelSize, worldSizeToPanelSize, worldToPanelLocal } from "./hole-geometry";

describe("panelSize", () => {
  it("floor and ceiling are square, sized to the room", () => {
    expect(panelSize("floor")).toEqual([8, 8]);
    expect(panelSize("ceiling")).toEqual([8, 8]);
  });

  it("walls are room-wide and wall-tall", () => {
    expect(panelSize("back")).toEqual([8, 4]);
    expect(panelSize("front")).toEqual([8, 4]);
    expect(panelSize("left")).toEqual([8, 4]);
    expect(panelSize("right")).toEqual([8, 4]);
  });
});

describe("worldToPanelLocal", () => {
  it("floor: local x follows world x, local y is inverted world z", () => {
    expect(worldToPanelLocal("floor", [1, 0, -2])).toEqual({ cx: 1, cy: 2 });
  });

  it("ceiling: local x follows world x, local y follows world z", () => {
    expect(worldToPanelLocal("ceiling", [1, 4, -2])).toEqual({ cx: 1, cy: -2 });
  });

  it("back wall: local x follows world x, local y is world y minus half the wall height", () => {
    expect(worldToPanelLocal("back", [1.5, 1, -3.98])).toEqual({ cx: 1.5, cy: -1 });
  });

  it("front wall: local x is inverted world x", () => {
    expect(worldToPanelLocal("front", [1.5, 3, 3.98])).toEqual({ cx: -1.5, cy: 1 });
  });

  it("left wall: local x is inverted world z", () => {
    expect(worldToPanelLocal("left", [-3.98, 2, 1.5])).toEqual({ cx: -1.5, cy: 0 });
  });

  it("right wall: local x follows world z", () => {
    expect(worldToPanelLocal("right", [3.98, 2, 1.5])).toEqual({ cx: 1.5, cy: 0 });
  });

  it("round-trips a centered item back to the panel's own center", () => {
    // A back-wall item centered at wall height (y=2) sits at the panel's origin.
    expect(worldToPanelLocal("back", [0, 2, -3.98])).toEqual({ cx: 0, cy: 0 });
  });
});

describe("worldSizeToPanelSize", () => {
  const size = { x: 1.2, y: 2, z: 0.4 };

  it("floor/ceiling take width from x and height from z", () => {
    expect(worldSizeToPanelSize("floor", size)).toEqual({ width: 1.2, height: 0.4 });
    expect(worldSizeToPanelSize("ceiling", size)).toEqual({ width: 1.2, height: 0.4 });
  });

  it("back/front walls take width from x and height from y", () => {
    expect(worldSizeToPanelSize("back", size)).toEqual({ width: 1.2, height: 2 });
    expect(worldSizeToPanelSize("front", size)).toEqual({ width: 1.2, height: 2 });
  });

  it("left/right walls take width from z and height from y", () => {
    expect(worldSizeToPanelSize("left", size)).toEqual({ width: 0.4, height: 2 });
    expect(worldSizeToPanelSize("right", size)).toEqual({ width: 0.4, height: 2 });
  });
});

describe("buildPanelWithHoles", () => {
  it("builds a valid geometry with no holes", () => {
    const geometry = buildPanelWithHoles(8, 4, []);
    expect(geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it("builds a valid geometry with a centered hole", () => {
    const geometry = buildPanelWithHoles(8, 4, [{ cx: 0, cy: 0, width: 1.5, height: 2 }]);
    expect(geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it("clamps a hole that would otherwise poke outside the panel", () => {
    // An oversized hole near the edge shouldn't throw or blow up the
    // triangulation — it should just get clamped to fit inside.
    expect(() => buildPanelWithHoles(8, 4, [{ cx: 3.9, cy: 1.9, width: 3, height: 3 }])).not.toThrow();
  });
});
