// The implicit room's geometry — shared by room-scene.tsx (drawing the
// shell) and lib/surface.ts (snapping furniture to it), so the two never
// drift apart. No Room catalog/model exists in v1 — see house/models.py's
// FurnitureItem docstring.
export const ROOM_SIZE = 8;
export const WALL_HEIGHT = 4;
