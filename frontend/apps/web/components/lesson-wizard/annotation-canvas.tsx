"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { MaterialAnnotationOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import {
  drawAnnotation,
  drawEllipse,
  drawFreehand,
  drawRectangle,
  type DrawTool,
  type Point,
} from "@/lib/material-annotations";

const MIN_SHAPE_SIZE = 0.005;

function relativePoint(clientX: number, clientY: number, rect: DOMRect): Point {
  return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
}

// A <canvas> overlaid on the material content container (see
// components/lesson-wizard/materials-step.tsx), sized to the content's full
// scrollable area via ResizeObserver so it covers a long article, not just
// the viewport. Only captures pointer events while `drawMode` is on —
// otherwise text selection/scrolling underneath works unimpeded. Shapes are
// appended (drawn + persisted via onDraw), not re-editable in this pass.
export function AnnotationCanvas({
  containerRef,
  drawMode,
  tool,
  color,
  annotations,
  onDraw,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  drawMode: boolean;
  tool: DrawTool;
  color: string;
  annotations: MaterialAnnotationOut[];
  onDraw: (kind: DrawTool, geometry: Record<string, unknown>, body?: string) => void;
}) {
  const t = useTranslations("MaterialAnnotationPanel");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const drawingRef = useRef<{ start: Point; points: Point[] } | null>(null);
  const [textNotePoint, setTextNotePoint] = useState<Point | null>(null);
  const [textNoteValue, setTextNoteValue] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => setSize({ width: container.scrollWidth, height: container.scrollHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || size.width === 0) return;
    canvas.width = size.width;
    canvas.height = size.height;
    ctx.clearRect(0, 0, size.width, size.height);
    for (const annotation of annotations) drawAnnotation(ctx, annotation, size);
  }, [annotations, size]);

  const redrawPersisted = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, size.width, size.height);
    for (const annotation of annotations) drawAnnotation(ctx, annotation, size);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const point = relativePoint(e.clientX, e.clientY, rect);
    if (tool === "text_note") {
      setTextNotePoint(point);
      setTextNoteValue("");
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = { start: point, points: [point] };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawMode || !drawingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const point = relativePoint(e.clientX, e.clientY, rect);
    if (tool === "freehand") drawingRef.current.points.push(point);
    else drawingRef.current.points = [drawingRef.current.start, point];

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    redrawPersisted(ctx);
    const { start, points } = drawingRef.current;
    if (tool === "freehand") {
      drawFreehand(ctx, { points }, size, color);
    } else {
      const end = points[points.length - 1];
      const rectGeometry = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      };
      if (tool === "rectangle") drawRectangle(ctx, rectGeometry, size, color);
      else drawEllipse(ctx, rectGeometry, size, color);
    }
  };

  const handlePointerUp = () => {
    if (!drawMode || !drawingRef.current) return;
    const { start, points } = drawingRef.current;
    drawingRef.current = null;

    if (tool === "freehand") {
      if (points.length < 2) return;
      onDraw("freehand", { points });
      return;
    }
    const end = points[points.length - 1];
    const geometry = {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
    if (geometry.width < MIN_SHAPE_SIZE || geometry.height < MIN_SHAPE_SIZE) return; // ignore a stray click
    onDraw(tool, geometry);
  };

  const submitTextNote = () => {
    if (textNotePoint && textNoteValue.trim()) {
      onDraw("text_note", { x: textNotePoint.x, y: textNotePoint.y }, textNoteValue.trim());
    }
    setTextNotePoint(null);
    setTextNoteValue("");
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          drawingRef.current = null;
        }}
        className={`absolute inset-0 h-full w-full ${drawMode ? "cursor-crosshair" : "pointer-events-none"}`}
      />
      {textNotePoint && (
        <input
          type="text"
          autoFocus
          value={textNoteValue}
          placeholder={t("textNotePlaceholder")}
          onChange={(e) => setTextNoteValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitTextNote();
            if (e.key === "Escape") {
              setTextNotePoint(null);
              setTextNoteValue("");
            }
          }}
          onBlur={submitTextNote}
          style={{
            position: "absolute",
            left: `${textNotePoint.x * 100}%`,
            top: `${textNotePoint.y * 100}%`,
          }}
          className="z-10 rounded border border-red-400 bg-white px-1.5 py-0.5 text-sm text-red-600 shadow"
        />
      )}
    </>
  );
}
