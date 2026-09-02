"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Circle, Highlighter, MousePointer2, PenLine, Square, Type } from "lucide-react";
import type { MaterialAnnotationOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import type { DrawTool } from "@/lib/material-annotations";

const TOOLS: { value: DrawTool; Icon: typeof Square }[] = [
  { value: "rectangle", Icon: Square },
  { value: "ellipse", Icon: Circle },
  { value: "freehand", Icon: PenLine },
  { value: "text_note", Icon: Type },
];

// Right-side panel next to a material's content (see materials-step.tsx):
// a draw-mode toggle + shape tools (only active in draw mode — otherwise
// text selection/scrolling in the content works unimpeded), plus, based on
// the current text selection (independent of draw mode), a Highlight button
// and a comment box, and the list of comments already left on this
// material.
export function MaterialAnnotationPanel({
  drawMode,
  onDrawModeChange,
  tool,
  onToolChange,
  hasSelection,
  onHighlight,
  onAddComment,
  comments,
  onJumpToComment,
}: {
  drawMode: boolean;
  onDrawModeChange: (enabled: boolean) => void;
  tool: DrawTool;
  onToolChange: (tool: DrawTool) => void;
  hasSelection: boolean;
  onHighlight: () => void;
  onAddComment: (body: string) => void;
  comments: MaterialAnnotationOut[];
  onJumpToComment: (sentenceStart: number) => void;
}) {
  const t = useTranslations("MaterialAnnotationPanel");
  const [commentDraft, setCommentDraft] = useState("");

  const handleAddComment = () => {
    if (!commentDraft.trim()) return;
    onAddComment(commentDraft.trim());
    setCommentDraft("");
  };

  return (
    <div className="flex w-full flex-col gap-4 rounded-md border border-gray-200 p-4 lg:w-72">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-gray-900">{t("drawingTitle")}</span>
        <button
          type="button"
          onClick={() => onDrawModeChange(!drawMode)}
          className={`inline-flex w-fit items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
            drawMode ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          {drawMode ? <Square className="size-4" /> : <MousePointer2 className="size-4" />}
          {drawMode ? t("drawModeOnButton") : t("drawModeOffButton")}
        </button>

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
        <button
          type="button"
          onClick={onHighlight}
          disabled={!hasSelection}
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Highlighter className="size-4" />
          {t("highlightButton")}
        </button>
        <textarea
          rows={2}
          value={commentDraft}
          onChange={(e) => setCommentDraft(e.target.value)}
          disabled={!hasSelection}
          placeholder={t("commentPlaceholder")}
          className="rounded-md border border-gray-300 p-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-50"
        />
        <button
          type="button"
          onClick={handleAddComment}
          disabled={!hasSelection || !commentDraft.trim()}
          className="w-fit rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("addCommentButton")}
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
  );
}
