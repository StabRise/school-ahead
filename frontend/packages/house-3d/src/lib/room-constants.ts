// The implicit room's geometry — shared by room-scene.tsx (drawing the
// shell) and lib/surface.ts (snapping furniture to it), so the two never
// drift apart. No Room catalog/model exists in v1 — see house/models.py's
// FurnitureItem docstring.
export const ROOM_SIZE = 8;
export const WALL_HEIGHT = 4;

// RoomShell's stock colors (room-scene.tsx) — also house-view.tsx's
// fallback before house.services.get_room_style's own identical defaults
// (models.RoomStyle) have loaded, so the room never flashes an
// intermediate color while GET /house/room-style is in flight.
export const DEFAULT_WALL_COLOR = "#f4efe4";
export const DEFAULT_FLOOR_COLOR = "#e7e0d3";
