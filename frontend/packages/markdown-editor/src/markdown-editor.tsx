"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "./markdown";
import { MarkdownToolbar, type MarkdownToolbarActions } from "./markdown-toolbar";
import { insertText, prefixLines, wrapSelection } from "./lib/textarea-edit";

// Raw-markdown textarea with a toggle to preview it rendered through the
// same <Markdown> component students/tutors see elsewhere — no separate
// WYSIWYG editor, since every Lesson field this edits is already
// tutor-authored plain markdown. The toolbar above the textarea (edit mode
// only) wires MarkdownToolbar's actions to plain string/selectionStart-End
// manipulation — see lib/textarea-edit.ts — the same button-to-markdown
// mapping story/story-rich-text-editor.tsx uses for its contentEditable
// surface, just operating on a controlled <textarea> instead of a DOM Range.
export function MarkdownEditor({
  value,
  onChange,
  rows = 10,
  // Off for a caller that already owns its own edit/preview switch around
  // this component (e.g. components/synopsis-editor.tsx, which toggles
  // between this editor and its own richer translate-on-select preview) —
  // suppresses this component's own toggle button/preview branch so there's
  // only ever one "preview" control on screen at a time.
  showPreviewToggle = true,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  showPreviewToggle?: boolean;
}) {
  const t = useTranslations("MarkdownEditor");
  const [showPreview, setShowPreview] = useState(false);
  const previewing = showPreviewToggle && showPreview;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

  // Restores the caret/selection after a toolbar action's onChange causes a
  // re-render of the controlled textarea — React doesn't preserve
  // selectionStart/End across a value change on its own.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    const pending = pendingSelectionRef.current;
    if (el && pending) {
      el.focus();
      el.setSelectionRange(pending.start, pending.end);
      pendingSelectionRef.current = null;
    }
  });

  const apply = (edit: (v: string, start: number, end: number) => ReturnType<typeof insertText>) => {
    const el = textareaRef.current;
    if (!el) return;
    const result = edit(value, el.selectionStart, el.selectionEnd);
    pendingSelectionRef.current = { start: result.selectionStart, end: result.selectionEnd };
    onChange(result.value);
  };

  const toolbarActions: MarkdownToolbarActions = {
    onHeading: (level) => apply((v, s, e) => prefixLines(v, s, e, `${"#".repeat(level)} `)),
    onBold: () => apply((v, s, e) => wrapSelection(v, s, e, "**")),
    onItalic: () => apply((v, s, e) => wrapSelection(v, s, e, "*")),
    onInlineCode: () => apply((v, s, e) => wrapSelection(v, s, e, "`")),
    onBlockquote: () => apply((v, s, e) => prefixLines(v, s, e, "> ")),
    onBulletList: () => apply((v, s, e) => prefixLines(v, s, e, "- ")),
    onNumberedList: () => apply((v, s, e) => prefixLines(v, s, e, "1. ")),
    onLink: () =>
      apply((v, s, e) => insertText(v, s, e, `[${v.slice(s, e) || t("linkPlaceholder")}](url)`)),
    onHorizontalRule: () =>
      apply((v, s, e) => insertText(v, s, e, `${s === 0 || v[s - 1] === "\n" ? "" : "\n"}---\n`)),
    onInsertEmoji: (emoji) => apply((v, s, e) => insertText(v, s, e, emoji)),
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {!previewing && <MarkdownToolbar actions={toolbarActions} />}
        {showPreviewToggle && (
          <button
            type="button"
            onClick={() => setShowPreview((prev) => !prev)}
            className="ml-auto text-xs font-medium text-blue-700 hover:underline"
          >
            {previewing ? t("editButton") : t("previewButton")}
          </button>
        )}
      </div>
      {previewing ? (
        <div className="min-h-32 rounded-md border border-gray-200 bg-gray-50 p-3">
          <Markdown content={value} embedYoutube embedPdf />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900"
        />
      )}
    </div>
  );
}
