import { ROOM_SIZE, WALL_HEIGHT } from "./room-constants";

export type FurnitureSurface = "floor" | "wall" | "ceiling";
// "with_hole" (a window, door, ...) gets an opening cut into its surface
// (see lib/hole-geometry.ts) but is otherwise positioned/rotated exactly
// like any other item.
export type FurnitureKind = "normal" | "with_hole";

type Vec3 = [number, number, number];
export type Wall = "back" | "front" | "left" | "right";

const HALF_ROOM = ROOM_SIZE / 2;
// Pulls the mesh's pivot slightly off the wall plane so it doesn't
// z-fight with the room shell it's stuck to.
const WALL_OFFSET = 0.02;
// How far off the literal floor/ceiling plane a tutor's default_position_y
// (house.models.FurnitureItem) is allowed to nudge an item — a "little
// move", not free vertical placement: enough to fix a model whose own
// pivot isn't at its base (so it looks sunk into the floor, or floating
// off the ceiling) without letting it drift away from its surface.
const MAX_SURFACE_OFFSET = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Which wall (of the room's four — see room-scene.tsx's RoomShell) a
// position is currently nearest to. Exported for room-scene.tsx, which
// needs to know which wall panel to cut a WITH_HOLE item's opening into
// (see lib/hole-geometry.ts).
export function nearestWall(x: number, z: number): Wall {
  const candidates: [distance: number, wall: Wall][] = [
    [Math.abs(z - -HALF_ROOM), "back"],
    [Math.abs(z - HALF_ROOM), "front"],
    [Math.abs(x - -HALF_ROOM), "left"],
    [Math.abs(x - HALF_ROOM), "right"],
  ];
  const [, wall] = candidates.reduce((closest, candidate) => (candidate[0] < closest[0] ? candidate : closest));
  return wall;
}

export interface SnappedTransform {
  position: Vec3;
  // The *outer* group's rotation.y (see furniture-mesh.tsx) — for
  // floor/ceiling this is the student's own free spin, passed straight
  // through; for walls it's always recomputed from the current position
  // (ignoring whatever y was passed in), so the item faces into the room
  // no matter what.
  facingY: number;
  // The *inner* group's rotation.x/z — a tutor's default_rotation
  // correction (house.models.FurnitureItem), e.g. standing a window
  // upright that was authored lying flat. Passed straight through
  // unchanged: nothing here ever derives or mutates it.
  tiltX: number;
  tiltZ: number;
}

// Snaps a position/rotation onto the surface a FurnitureItem is tagged
// with (house.models.FurnitureSurface) — floor items stay grounded near
// y=0, ceiling items stay flush against the ceiling, and wall items snap
// flush against whichever of the room's four walls they're currently
// nearest to, facing into the room.
//
// The tilt (rotation.x/z) and the facing/spin (rotation.y) are returned
// as *separate* values rather than merged back into one rotation triple,
// and furniture-mesh.tsx applies them to two nested Object3D groups
// instead of one. That split matters: three.js composes a single
// rotation's x/y/z intrinsically (in order), so if an item has any real
// x/z tilt (e.g. 90° to stand a window up), setting rotation.y on that
// *same* triple to "face wall X" no longer spins it around the room's true
// vertical axis — it spins around whatever axis the tilt left pointing
// "up" locally, which is wrong. Two separate rotations (facing on the
// outer node, tilt on the inner one) sidesteps that entirely: the facing
// spin always happens in world space, unaffected by whatever local tilt
// the inner node carries.
//
// Applied both right after every drag (furniture-mesh.tsx's
// onTransformEnd, so what gets persisted is always already snapped) and on
// every render (so a stored placement — or a catalog default — always
// renders stuck to its surface, even before the student ever drags it).
export function snapToSurface(surface: FurnitureSurface, position: Vec3, rotation: Vec3): SnappedTransform {
  const [x, y, z] = position;
  const [tiltX, spinY, tiltZ] = rotation;

  if (surface === "floor") {
    return { position: [x, clamp(y, -MAX_SURFACE_OFFSET, MAX_SURFACE_OFFSET), z], facingY: spinY, tiltX, tiltZ };
  }

  if (surface === "ceiling") {
    return {
      position: [x, clamp(y, WALL_HEIGHT - MAX_SURFACE_OFFSET, WALL_HEIGHT + MAX_SURFACE_OFFSET), z],
      facingY: spinY,
      tiltX,
      tiltZ,
    };
  }

  const wall = nearestWall(x, z);
  const clampedY = clamp(y, 0, WALL_HEIGHT);
  const clampedX = clamp(x, -HALF_ROOM, HALF_ROOM);
  const clampedZ = clamp(z, -HALF_ROOM, HALF_ROOM);

  if (wall === "back") {
    return { position: [clampedX, clampedY, -HALF_ROOM + WALL_OFFSET], facingY: 0, tiltX, tiltZ };
  }
  if (wall === "front") {
    return { position: [clampedX, clampedY, HALF_ROOM - WALL_OFFSET], facingY: Math.PI, tiltX, tiltZ };
  }
  if (wall === "left") {
    return { position: [-HALF_ROOM + WALL_OFFSET, clampedY, clampedZ], facingY: Math.PI / 2, tiltX, tiltZ };
  }
  return { position: [HALF_ROOM - WALL_OFFSET, clampedY, clampedZ], facingY: -Math.PI / 2, tiltX, tiltZ };
}
