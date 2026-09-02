"use client";

import { useTranslations } from "next-intl";
import { Circle, MessageSquarePlus, MousePointer2, PenLine, Square, Trash2, Type } from "lucide-react";
import type { MaterialAnnotationOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { HIGHLIGHT_COLORS, type DrawTool } from "@/lib/material-annotations";

const TOOLS: { value: DrawTool; Icon: typeof Square }[] = [
  { value: "rectangle", Icon: Square },
  { value: "ellipse", Icon: Circle },
  { value: "freehand", Icon: PenLine },
  { value: "text_note", Icon: Type },
];

function DrawModeToggle({
  drawMode,
  onDrawModeChange,
  labeled,
  label,
}: {
  drawMode: boolean;
  onDrawModeChange: (enabled: boolean) => void;
  labeled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => onDrawModeChange(!drawMode)}
      className={
        labeled
          ? `inline-flex w-fit items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
              drawMode ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`
          : `flex h-9 w-9 items-center justify-center rounded-full ${
              drawMode ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
            }`
      }
    >
      {drawMode ? <Square className="size-4" /> : <MousePointer2 className="size-4" />}
      {labeled && label}
    </button>
  );
}

function ColorSwatches({ onPick, disabled, size }: { onPick: (color: string) => void; disabled: boolean; size: "sm" | "xs" }) {
  const dimension = size === "sm" ? "h-6 w-6" : "h-5 w-5";
  return (
    <div className={`flex ${size === "sm" ? "gap-2" : "flex-col gap-1.5"}`}>
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          disabled={disabled}
          // Keeps the browser from collapsing the text selection on
          // mousedown, before onClick (which needs it) ever fires — same
          // trick as read-along-content.tsx's floating "Прочитати" button.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(color)}
          style={{ backgroundColor: color }}
          className={`${dimension} rounded-full ring-1 ring-inset ring-black/10 disabled:cursor-not-allowed disabled:opacity-30`}
        />
      ))}
    </div>
  );
}

// Annotation controls for a material's detail view (see materials-step.tsx):
// drawing tools (only active in "draw mode" — otherwise text
// selection/scrolling in the content works unimpeded) and, based on the
// current text selection (independent of draw mode), highlight colors and
// an "add comment" action. Renders as two different presentations of the
// same state/handlers: a labeled panel fixed to the right on wide screens
// (`lg:`), and a compact icon-only vertical bar floating over the content
// on narrow screens — both fixed-positioned so they stay visible while
// scrolling a long material (see materials-step.tsx's MaterialDetail,
// which also fixes the underlying "panel disappears while scrolling"
// report this replaces).
export function MaterialAnnotationPanel({
  drawMode,
  onDrawModeChange,
  tool,
  onToolChange,
  hasSelection,
  onHighlight,
  onRequestComment,
  onDeleteSelection,
  comments,
  onJumpToComment,
}: {
  drawMode: boolean;
  onDrawModeChange: (enabled: boolean) => void;
  tool: DrawTool;
  onToolChange: (tool: DrawTool) => void;
  hasSelection: boolean;
  onHighlight: (color: string) => void;
  onRequestComment: () => void;
  /** Permanently removes the selected sentences from the material's saved content. */
  onDeleteSelection: () => void;
  comments: MaterialAnnotationOut[];
  onJumpToComment: (sentenceStart: number) => void;
}) {
  const t = useTranslations("MaterialAnnotationPanel");

  return (
    <>
      {/* Desktop: labeled panel, fixed to the right edge of the viewport. */}
      <div className="hidden lg:fixed lg:right-6 lg:top-24 lg:z-30 lg:flex lg:max-h-[calc(100vh-7rem)] lg:w-72 lg:flex-col lg:gap-4 lg:overflow-y-auto lg:rounded-md lg:border lg:border-gray-200 lg:bg-white lg:p-4 lg:shadow-lg">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-gray-900">{t("drawingTitle")}</span>
          <DrawModeToggle
            drawMode={drawMode}
            onDrawModeChange={onDrawModeChange}
            labeled
            label={drawMode ? t("drawModeOnButton") : t("drawModeOffButton")}
          />
          {drawMode && (
            <div className="flex gap-1">
              {TOOLS.map(({ value, Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-label={t(`tool_${value}`)}
                  onClick={() => onToolChange(value)}
                  className={`rounded-md p-2 ${
                    tool === value ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-gray-200 pt-4">
          <span className="text-sm font-semibold text-gray-900">{t("selectionTitle")}</span>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-600">{t("highlightLabel")}</span>
            <ColorSwatches onPick={onHighlight} disabled={!hasSelection} size="sm" />
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRequestComment}
            disabled={!hasSelection}
            className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MessageSquarePlus className="size-4" />
            {t("addCommentButton")}
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onDeleteSelection}
            disabled={!hasSelection}
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="size-4" />
            {t("deleteSelectionButton")}
          </button>
        </div>

        <div className="flex flex-col gap-2 border-t border-gray-200 pt-4">
          <span className="text-sm font-semibold text-gray-900">{t("commentsTitle")}</span>
          {comments.length === 0 ? (
            <p className="text-sm text-gray-500">{t("noComments")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {comments.map((comment) => (
                <li key={comment.id}>
                  <button
                    type="button"
                    onClick={() => comment.sentence_start !== null && onJumpToComment(comment.sentence_start)}
                    className="w-full rounded-md border border-gray-200 p-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {comment.body}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Mobile/narrow: compact icon-only vertical bar floating over the content. */}
      <div className="fixed right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-2 rounded-full bg-gray-900/90 p-2 shadow-lg lg:hidden">
        <DrawModeToggle
          drawMode={drawMode}
          onDrawModeChange={onDrawModeChange}
          labeled={false}
          label={drawMode ? t("drawModeOnButton") : t("drawModeOffButton")}
        />
        {drawMode && (
          <div className="flex flex-col gap-1 border-t border-white/20 pt-2">
            {TOOLS.map(({ value, Icon }) => (
              <button
                key={value}
                type="button"
                aria-label={t(`tool_${value}`)}
                onClick={() => onToolChange(value)}
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  tool === value ? "bg-white text-gray-900" : "text-white hover:bg-white/10"
                }`}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        )}
        <div className="border-t border-white/20 pt-2">
          <ColorSwatches onPick={onHighlight} disabled={!hasSelection} size="xs" />
        </div>
        <button
          type="button"
          aria-label={t("addCommentButton")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onRequestComment}
          disabled={!hasSelection}
          className="flex h-9 w-9 items-center justify-center rounded-full border-t border-white/20 text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <MessageSquarePlus className="size-4" />
        </button>
        <button
          type="button"
          aria-label={t("deleteSelectionButton")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDeleteSelection}
          disabled={!hasSelection}
          className="flex h-9 w-9 items-center justify-center rounded-full text-red-400 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </>
  );
}
