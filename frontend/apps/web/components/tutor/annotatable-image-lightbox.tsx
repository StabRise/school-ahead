"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Download, Paperclip, Pencil, RotateCcw, Send, Trash2, Type, X } from "lucide-react";

type Point = { x: number; y: number };
type Action =
  | { kind: "stroke"; points: Point[]; color: string }
  | { kind: "arrow"; from: Point; to: Point; color: string }
  | { kind: "text"; x: number; y: number; text: string; color: string };

type Tool = "pen" | "arrow" | "text";

// Red first to match how tutors already mark up screenshots elsewhere.
const COLORS = ["#ef4444", "#2563eb", "#16a34a", "#111827"];
const STROKE_WIDTH = 3;
const TEXT_FONT = "600 16px system-ui, sans-serif";

function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string) {
  const headLength = 14;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLength * Math.cos(angle - Math.PI / 6), to.y - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - headLength * Math.cos(angle + Math.PI / 6), to.y - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawStroke(ctx: CanvasRenderingContext2D, points: Point[], color: string) {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  ctx.stroke();
}

function drawText(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  ctx.font = TEXT_FONT;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
}

// A tutor-only image viewer that layers a drawing canvas over the student's
// attached image — freehand pen, arrows, and text notes, so a tutor can
// mark up exactly what needs fixing instead of describing it in words.
// "Download" always composites them into a PNG the tutor can save; when
// `canAttach` is given (the lesson is still pending review — see
// SubmissionAttachmentEntry), two more buttons appear, both handing that
// same PNG up rather than calling any API themselves:
// - "Add to reply" (`onAttach`) piles it onto the tutor feedback form's
//   (PendingReviewPanel) pending list, alongside whatever else is attached
//   there and typed feedback, for the tutor to review and send later.
// - "Send for revision" (`onAttachAndSend`) does the same but also submits
//   the whole reply immediately — a one-click shortcut for "just this
//   image, right now" instead of attach-then-go-find-the-send-button.
// Either way only request-revision ever accepts images (grading doesn't).
// Works from any past submission's image, not just the latest one.
export function AnnotatableImageLightbox({
  src,
  alt,
  canAttach = false,
  onAttach,
  onAttachAndSend,
}: {
  src: string;
  alt: string;
  canAttach?: boolean;
  onAttach?: (file: File) => void;
  onAttachAndSend?: (file: File) => void;
}) {
  const t = useTranslations("AnnotatableImage");
  const [open, setOpen] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [actions, setActions] = useState<Action[]>([]);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef(false);
  const strokePointsRef = useRef<Point[]>([]);
  const arrowStartRef = useRef<Point | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !dimensions) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);
    ctx.drawImage(image, 0, 0, dimensions.width, dimensions.height);
    for (const action of actions) {
      if (action.kind === "stroke") drawStroke(ctx, action.points, action.color);
      else if (action.kind === "arrow") drawArrow(ctx, action.from, action.to, action.color);
      else drawText(ctx, action.x, action.y, action.text, action.color);
    }
  }, [actions, dimensions]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Loads (and sizes to fit the viewport) only once the dialog is actually
  // open — no point paying for it on every thumbnail render.
  useEffect(() => {
    if (!open) return;
    const image = new Image();
    // Without this, drawing a cross-origin image (Django's media host is a
    // separate origin from this Next.js app) onto the canvas "taints" it —
    // canvas.toBlob()/toDataURL() then throw SecurityError even though the
    // image displays fine. The media response already sends a matching
    // Access-Control-Allow-Origin (see core/settings.py CORS_ALLOWED_ORIGINS),
    // so requesting it in CORS mode is all that's missing.
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const maxWidth = Math.min(window.innerWidth * 0.85, 1100);
      const maxHeight = window.innerHeight * 0.7;
      const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
      imageRef.current = image;
      setDimensions({
        width: Math.round(image.naturalWidth * scale),
        height: Math.round(image.naturalHeight * scale),
      });
    };
    image.src = src;
  }, [open, src]);

  const resetState = () => {
    setActions([]);
    setTextDraft(null);
    setDimensions(null);
    imageRef.current = null;
  };

  const closeAndReset = () => {
    setOpen(false);
    resetState();
  };

  const getPoint = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const point = getPoint(e);
    if (tool === "text") {
      // Without this, the browser's default mousedown focus handling (the
      // canvas itself isn't focusable) fires right after React focuses the
      // new <input> via autoFocus, immediately blurring it — which commits
      // (and, since it's still empty, discards) the draft before the tutor
      // can type anything.
      e.preventDefault();
      // Commit whatever text was already being drafted before jumping to
      // the new spot, instead of silently overwriting it — `commitText`
      // reads the pre-click `textDraft` via closure since it's called here,
      // and setting the new draft right after wins the state update.
      commitText();
      setTextDraft({ x: point.x, y: point.y, value: "" });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    if (tool === "pen") {
      strokePointsRef.current = [point];
    } else {
      arrowStartRef.current = point;
    }
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const point = getPoint(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    if (tool === "pen") {
      const points = strokePointsRef.current;
      const previous = points[points.length - 1];
      points.push(point);
      ctx.strokeStyle = color;
      ctx.lineWidth = STROKE_WIDTH;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    } else if (tool === "arrow" && arrowStartRef.current) {
      // Redraw the committed picture first — an in-progress arrow is a
      // preview, not additive strokes, so its old position has to be erased
      // each time the pointer moves.
      redraw();
      drawArrow(ctx, arrowStartRef.current, point, color);
    }
  };

  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const point = getPoint(e);
    // Capture the ref's current contents into a local before resetting it
    // below — the `setActions` updater can run after this function returns,
    // by which point a shared mutable `.current` read from inside it would
    // already see the reset (empty) value, silently dropping the stroke.
    if (tool === "pen" && strokePointsRef.current.length > 1) {
      const points = strokePointsRef.current;
      setActions((prev) => [...prev, { kind: "stroke", points, color }]);
    } else if (tool === "arrow" && arrowStartRef.current) {
      const from = arrowStartRef.current;
      setActions((prev) => [...prev, { kind: "arrow", from, to: point, color }]);
    }
    strokePointsRef.current = [];
    arrowStartRef.current = null;
  };

  const commitText = () => {
    if (textDraft && textDraft.value.trim()) {
      setActions((prev) => [
        ...prev,
        { kind: "text", x: textDraft.x, y: textDraft.y, text: textDraft.value, color },
      ]);
    }
    setTextDraft(null);
  };

  const handleUndo = () => setActions((prev) => prev.slice(0, -1));
  const handleClear = () => setActions([]);

  const handleDownload = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${alt || "annotated-image"}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  // Named after the source image (falls back to a generic name if `alt` is
  // empty) so the pending-attachment preview in PendingReviewPanel shows
  // something recognizable instead of a bare "tutor-feedback.png" repeated
  // for every attachment.
  const annotatedFileName = `${(alt || "annotated-image").replace(/\.[^./]+$/, "")}-annotated.png`;

  const handleAttach = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], annotatedFileName, { type: "image/png" });
      onAttach?.(file);
      closeAndReset();
    }, "image/png");
  };

  const handleAttachAndSend = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], annotatedFileName, { type: "image/png" });
      onAttachAndSend?.(file);
      closeAndReset();
    }, "image/png");
  };

  const toolButtonClass = (active: boolean) =>
    `flex h-8 w-8 items-center justify-center rounded-full ${active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else closeAndReset();
      }}
    >
      <Dialog.Trigger asChild>
        <button type="button" className="mt-1 block cursor-zoom-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-48 max-w-full rounded-md border border-gray-200 object-contain" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <Dialog.Content className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-6">
          <Dialog.Title className="sr-only">{alt}</Dialog.Title>

          <div className="flex flex-wrap items-center gap-1 rounded-full bg-white/95 px-3 py-2 shadow-lg">
            <button type="button" onClick={() => setTool("pen")} aria-pressed={tool === "pen"} title={t("penTool")} className={toolButtonClass(tool === "pen")}>
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setTool("arrow")} aria-pressed={tool === "arrow"} title={t("arrowTool")} className={toolButtonClass(tool === "arrow")}>
              <ArrowUpRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setTool("text")} aria-pressed={tool === "text"} title={t("textTool")} className={toolButtonClass(tool === "text")}>
              <Type className="h-4 w-4" />
            </button>

            <div className="mx-1 h-5 w-px bg-gray-200" />

            {COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => setColor(swatch)}
                aria-label={swatch}
                aria-pressed={color === swatch}
                className={`h-6 w-6 shrink-0 rounded-full ${color === swatch ? "ring-2 ring-gray-900 ring-offset-2" : ""}`}
                style={{ backgroundColor: swatch }}
              />
            ))}

            <div className="mx-1 h-5 w-px bg-gray-200" />

            <button
              type="button"
              onClick={handleUndo}
              disabled={actions.length === 0}
              title={t("undoButton")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-30"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={actions.length === 0}
              title={t("clearButton")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-30"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleDownload}
              title={t("downloadButton")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
            >
              <Download className="h-4 w-4" />
            </button>

            {canAttach && (
              <>
                <div className="mx-1 h-5 w-px bg-gray-200" />
                <button
                  type="button"
                  onClick={handleAttach}
                  disabled={actions.length === 0}
                  title={t("attachButton")}
                  className="flex h-8 items-center gap-1.5 rounded-full border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {t("attachButton")}
                </button>
                <button
                  type="button"
                  onClick={handleAttachAndSend}
                  disabled={actions.length === 0}
                  title={t("attachAndSendButton")}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" />
                  {t("attachAndSendButton")}
                </button>
              </>
            )}
          </div>

          <div className="relative" style={dimensions ? { width: dimensions.width, height: dimensions.height } : undefined}>
            {dimensions ? (
              <canvas
                ref={canvasRef}
                width={dimensions.width}
                height={dimensions.height}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className={`touch-none rounded-md border border-gray-200 bg-white ${tool === "text" ? "cursor-text" : "cursor-crosshair"}`}
              />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center text-sm text-white">…</div>
            )}
            {textDraft && (
              <input
                autoFocus
                value={textDraft.value}
                onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitText();
                  if (e.key === "Escape") setTextDraft(null);
                }}
                onBlur={commitText}
                placeholder={t("textPlaceholder")}
                style={{ left: textDraft.x, top: textDraft.y, color }}
                className="absolute z-10 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-sm font-semibold shadow-sm outline-none"
              />
            )}
          </div>

          <Dialog.Close className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <X className="h-4 w-4" />
            <span className="sr-only">{t("closeLabel")}</span>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
