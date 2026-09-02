import type { MaterialAnnotationOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

// The four drawing tools components/lesson-wizard/material-annotation-panel.tsx
// offers — separate from "highlight"/"comment", which come from selecting
// text rather than drawing. Matches backend/lessons/models.py's
// MaterialAnnotationKind minus highlight/comment.
export type DrawTool = "rectangle" | "ellipse" | "freehand" | "text_note";

export interface Point {
  x: number;
  y: number;
}

// All fractional (0..1), relative to the material content container's
// rendered box — see backend/lessons/models.py's MaterialAnnotation
// docstring for why (placement survives different viewport widths).
export type RectGeometry = { x: number; y: number; width: number; height: number };
export type FreehandGeometry = { points: Point[] };
export type TextNoteGeometry = { x: number; y: number };

const DEFAULT_STROKE_COLOR = "#dc2626";

// The 4 pastel colors offered next to "Виділити кольором" — kept clear of
// yellow, which is reserved for the "currently speaking" highlight (see
// components/read-along-content.tsx) so the two never look the same.
export const HIGHLIGHT_COLORS = ["#FBCFE8", "#BBF7D0", "#BFDBFE", "#FED7AA"] as const;

function toRectGeometry(geometry: unknown): RectGeometry | null {
  const g = geometry as Partial<RectGeometry> | null;
  if (!g || typeof g.x !== "number" || typeof g.y !== "number" || typeof g.width !== "number" || typeof g.height !== "number") {
    return null;
  }
  return { x: g.x, y: g.y, width: g.width, height: g.height };
}

function toFreehandGeometry(geometry: unknown): FreehandGeometry | null {
  const g = geometry as Partial<FreehandGeometry> | null;
  if (!g || !Array.isArray(g.points)) return null;
  return { points: g.points };
}

function toTextNoteGeometry(geometry: unknown): TextNoteGeometry | null {
  const g = geometry as Partial<TextNoteGeometry> | null;
  if (!g || typeof g.x !== "number" || typeof g.y !== "number") return null;
  return { x: g.x, y: g.y };
}

// Draws one persisted annotation (or an in-progress one, via the standalone
// helpers below) onto a canvas already sized to `size` — fractional
// geometry is scaled up to that size at draw time, not stored in pixels.
export function drawAnnotation(ctx: CanvasRenderingContext2D, annotation: MaterialAnnotationOut, size: { width: number; height: number }): void {
  const color = annotation.color || DEFAULT_STROKE_COLOR;
  if (annotation.kind === "rectangle") {
    const rect = toRectGeometry(annotation.geometry);
    if (rect) drawRectangle(ctx, rect, size, color);
  } else if (annotation.kind === "ellipse") {
    const rect = toRectGeometry(annotation.geometry);
    if (rect) drawEllipse(ctx, rect, size, color);
  } else if (annotation.kind === "freehand") {
    const freehand = toFreehandGeometry(annotation.geometry);
    if (freehand) drawFreehand(ctx, freehand, size, color);
  } else if (annotation.kind === "text_note") {
    const note = toTextNoteGeometry(annotation.geometry);
    if (note) drawTextNote(ctx, note, annotation.body, size, color);
  }
}

export function drawRectangle(ctx: CanvasRenderingContext2D, rect: RectGeometry, size: { width: number; height: number }, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x * size.width, rect.y * size.height, rect.width * size.width, rect.height * size.height);
}

export function drawEllipse(ctx: CanvasRenderingContext2D, rect: RectGeometry, size: { width: number; height: number }, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(
    (rect.x + rect.width / 2) * size.width,
    (rect.y + rect.height / 2) * size.height,
    Math.max(1, (rect.width / 2) * size.width),
    Math.max(1, (rect.height / 2) * size.height),
    0,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
}

export function drawFreehand(ctx: CanvasRenderingContext2D, freehand: FreehandGeometry, size: { width: number; height: number }, color: string): void {
  if (freehand.points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(freehand.points[0].x * size.width, freehand.points[0].y * size.height);
  for (const point of freehand.points.slice(1)) ctx.lineTo(point.x * size.width, point.y * size.height);
  ctx.stroke();
}

export function drawTextNote(ctx: CanvasRenderingContext2D, note: TextNoteGeometry, text: string, size: { width: number; height: number }, color: string): void {
  ctx.font = "14px sans-serif";
  ctx.fillStyle = color;
  ctx.fillText(text, note.x * size.width, note.y * size.height);
}
