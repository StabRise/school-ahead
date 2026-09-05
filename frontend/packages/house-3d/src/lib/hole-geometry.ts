import * as THREE from "three";
import { ROOM_SIZE, WALL_HEIGHT } from "./room-constants";
import type { Wall } from "./surface";

export type PanelId = "floor" | "ceiling" | Wall;

export interface HoleRect {
  // Panel-local 2D coordinates, centered at the panel's own center — same
  // convention as PlaneGeometry (spans [-w/2, w/2] x [-h/2, h/2]).
  cx: number;
  cy: number;
  width: number;
  height: number;
}

// Keeps a cut hole a hair inside the panel's own edge — a hole whose edge
// touches (or a floating-point hair overshoots) the outer boundary makes
// ShapeGeometry's hole-in-a-shape triangulation degenerate.
const EDGE_MARGIN = 0.05;

// Each of the room's six flat panels (see room-scene.tsx's RoomShell), by
// the exact position/rotation that draws it — needed here to convert a
// FurnitureItem's world-space placement into that panel's own local 2D
// coordinates, so a WITH_HOLE item's opening (house.models.FurnitureKind)
// lands under the object instead of at the panel's origin.
export function panelSize(panel: PanelId): [width: number, height: number] {
  if (panel === "floor" || panel === "ceiling") return [ROOM_SIZE, ROOM_SIZE];
  return [ROOM_SIZE, WALL_HEIGHT];
}

// Converts a world-space position to the given panel's own local 2D
// coordinates — the inverse of the position/rotation room-scene.tsx draws
// that panel with. Each formula below is that panel's rotation matrix,
// solved for its flat (locally z=0) plane and its own position offset.
export function worldToPanelLocal(panel: PanelId, world: [number, number, number]): { cx: number; cy: number } {
  const [x, y, z] = world;
  switch (panel) {
    case "floor":
      return { cx: x, cy: -z };
    case "ceiling":
      return { cx: x, cy: z };
    case "back":
      return { cx: x, cy: y - WALL_HEIGHT / 2 };
    case "front":
      return { cx: -x, cy: y - WALL_HEIGHT / 2 };
    case "left":
      return { cx: -z, cy: y - WALL_HEIGHT / 2 };
    case "right":
      return { cx: z, cy: y - WALL_HEIGHT / 2 };
  }
}

// Converts a FurnitureItem's measured world-space bounding-box size (see
// furniture-mesh.tsx's onMeasured) to a panel's own 2D width/height — i.e.
// which two of the box's three world axes actually run along that panel.
export function worldSizeToPanelSize(
  panel: PanelId,
  size: { x: number; y: number; z: number },
): { width: number; height: number } {
  if (panel === "floor" || panel === "ceiling") return { width: size.x, height: size.z };
  if (panel === "left" || panel === "right") return { width: size.z, height: size.y };
  return { width: size.x, height: size.y };
}

function clampHoleToPanel(hole: HoleRect, panelWidth: number, panelHeight: number): HoleRect {
  const maxHalfW = panelWidth / 2 - EDGE_MARGIN;
  const maxHalfH = panelHeight / 2 - EDGE_MARGIN;
  const halfW = Math.min(hole.width / 2, maxHalfW);
  const halfH = Math.min(hole.height / 2, maxHalfH);
  const cx = Math.min(Math.max(hole.cx, -maxHalfW + halfW), maxHalfW - halfW);
  const cy = Math.min(Math.max(hole.cy, -maxHalfH + halfH), maxHalfH - halfH);
  return { cx, cy, width: halfW * 2, height: halfH * 2 };
}

// Builds a flat rectangular panel with 0+ rectangular holes cut out of
// it — used for a wall/floor/ceiling segment that has a WITH_HOLE item (a
// window, door, ...) stuck to it, so the room shell shows an actual
// opening the same size as the object instead of just placing the object
// in front of a solid surface. Each hole is clamped to stay fully inside
// the panel (with a small margin) so a poorly-placed item near a corner
// can't produce a degenerate cut. Falls back to a plain rectangle
// (equivalent to a plane) when `holes` is empty.
export function buildPanelWithHoles(panelWidth: number, panelHeight: number, holes: HoleRect[]): THREE.ShapeGeometry {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;
  const outer = new THREE.Shape();
  outer.moveTo(-halfW, -halfH);
  outer.lineTo(halfW, -halfH);
  outer.lineTo(halfW, halfH);
  outer.lineTo(-halfW, halfH);
  outer.closePath();

  for (const rawHole of holes) {
    const hole = clampHoleToPanel(rawHole, panelWidth, panelHeight);
    const hw = hole.width / 2;
    const hh = hole.height / 2;
    const path = new THREE.Path();
    path.moveTo(hole.cx - hw, hole.cy - hh);
    path.lineTo(hole.cx + hw, hole.cy - hh);
    path.lineTo(hole.cx + hw, hole.cy + hh);
    path.lineTo(hole.cx - hw, hole.cy + hh);
    path.closePath();
    outer.holes.push(path);
  }

  return new THREE.ShapeGeometry(outer);
}
