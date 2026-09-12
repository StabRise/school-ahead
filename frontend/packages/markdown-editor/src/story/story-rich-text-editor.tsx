"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Eraser } from "lucide-react";
import {
  detectCardGroup,
  IMAGE_CARD_RE,
  isAtLineStart,
  prefixLines,
  serializeContainer,
  splitIntoSegments,
  unformatCardText,
} from "./story-rich-text";
import { formatSelectionAsCards } from "./story-card-format";
import { MarkdownToolbar, type MarkdownToolbarActions } from "../markdown-toolbar";

// A single "{ <url> }" text/braces group matched exactly (not "anywhere in
// a longer string") — what a drop payload from story-asset-sidebar.tsx
// looks like when the dragged asset is a picture (see IMAGE_CARD_RE); an
// audio/video asset's payload won't match this and is dropped in as plain
// text instead (see handleDrop below).
const IMAGE_DROP_RE = new RegExp(`^${IMAGE_CARD_RE.source}$`, "i");

// `onDragStart`/`onDragEnd` let the editor track which chip (if any) a drag
// currently in progress came from — see handleDrop below, which moves that
// exact DOM node instead of inserting a duplicate when the drag originated
// from inside this same editor (as opposed to a fresh asset dragged in from
// story-asset-sidebar.tsx).
function buildImageChip(
  url: string,
  removeLabel: string,
  onRemoved: () => void,
  onDragStart: (chip: HTMLElement) => void,
  onDragEnd: () => void,
): HTMLElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.draggable = true;
  chip.dataset.imageUrl = url;
  chip.className = "relative mx-0.5 inline-block cursor-grab align-middle active:cursor-grabbing";

  chip.addEventListener("dragstart", (e) => {
    // Same "{ <url> }" shape story-asset-sidebar.tsx's drag payload uses, so
    // dropping this chip somewhere else in the editor (or back onto itself)
    // is indistinguishable, at the data level, from dragging a fresh asset in.
    e.dataTransfer?.setData("text/plain", `{ ${url} }`);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    onDragStart(chip);
  });
  chip.addEventListener("dragend", onDragEnd);

  const img = document.createElement("img");
  img.src = url;
  img.alt = "";
  img.draggable = false; // let the chip (not the browser's native image drag) own dragstart
  img.className = "inline-block h-14 w-auto rounded object-contain align-middle shadow";
  chip.appendChild(img);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.title = removeLabel;
  removeButton.setAttribute("aria-label", removeLabel);
  removeButton.textContent = "✕";
  removeButton.className =
    "absolute -right-1.5 -top-1.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-gray-900 text-[9px] text-white shadow hover:bg-red-600";
  removeButton.addEventListener("click", (e) => {
    e.preventDefault();
    chip.remove();
    onRemoved();
  });
  chip.appendChild(removeButton);

  return chip;
}

// caretRangeFromPoint (Chrome/Safari) vs caretPositionFromPoint (Firefox) —
// both give "the text position under this pixel", needed to drop an asset
// exactly where the tutor dragged it to rather than always at the end.
function caretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y);
  if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(x, y);
    if (!position) return null;
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }
  return null;
}

type SelectionToolbar =
  | { mode: "format"; top: number; left: number }
  | { mode: "unformat"; top: number; left: number };

// contentEditable surface for Story.content: a dropped/inserted picture
// renders as an actual inline image (see buildImageChip) instead of raw
// "{ <url> }" text, while the underlying value stays exactly that plain
// text — see story-rich-text.ts's serializeContainer, called after every
// DOM mutation to keep `onChange` in sync. The fixed MarkdownToolbar above
// it inserts basic Markdown syntax (headings, lists, a horizontal rule,
// bold, italic, code, links, emoji) at the cursor/selection.
//
// The DOM is the source of truth once mounted: `value` only seeds the
// *initial* content (useLayoutEffect below runs once), never re-syncs on
// every keystroke — doing that would fight the browser's own cursor
// position mid-edit. This is safe because the caller (story-editor-page.tsx)
// already remounts this component fresh per story via `key={story.id}`, so
// "once per mount" already means "once per story".
export function StoryRichTextEditor({
  value,
  onChange,
  rows = 14,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const t = useTranslations("TutorStories");
  const containerRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  // The chip currently being dragged, when the drag started on a chip already
  // in this editor — see handleDrop, which relocates this exact node instead
  // of inserting a fresh one when it's set.
  const draggedChipRef = useRef<HTMLElement | null>(null);
  const [toolbar, setToolbar] = useState<SelectionToolbar | null>(null);

  const emit = () => {
    const container = containerRef.current;
    if (container) onChange(serializeContainer(container));
  };

  const createImageChip = (url: string) =>
    buildImageChip(
      url,
      t("removeImageLabel"),
      emit,
      (chip) => {
        draggedChipRef.current = chip;
      },
      () => {
        draggedChipRef.current = null;
      },
    );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // <br> instead of a fresh <div>/<p> per line — keeps serializeContainer
    // simple (flat text/<br>/chip siblings) instead of having to reconstruct
    // arbitrarily nested per-browser line-wrapping markup. Deprecated but
    // still broadly supported, and exactly what minimal custom
    // contentEditable editors commonly rely on for this.
    document.execCommand("defaultParagraphSeparator", false, "br");

    container.innerHTML = "";
    for (const segment of splitIntoSegments(value)) {
      if (segment.type === "image") {
        container.appendChild(createImageChip(segment.url));
      } else if (segment.text) {
        container.appendChild(document.createTextNode(segment.text));
      }
    }
    // Intentionally only the initial value — see the component doc comment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateToolbarFromSelection = () => {
    const container = containerRef.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      setToolbar(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const text = range.toString();
    if (!container.contains(range.commonAncestorContainer) || !text.trim()) {
      setToolbar(null);
      return;
    }
    savedRangeRef.current = range.cloneRange();
    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const position = { top: rect.top - containerRect.top, left: rect.left - containerRect.left };
    // Already a "{...}" card (e.g. the tutor selected "{ш-та-н-ці}") — offer
    // to undo the formatting instead of wrapping it again.
    setToolbar(detectCardGroup(text) !== null ? { mode: "unformat", ...position } : { mode: "format", ...position });
  };

  const handleToolbarAction = () => {
    const range = savedRangeRef.current;
    if (!range || !toolbar) return;
    const text = range.toString();
    const replacement = toolbar.mode === "unformat" ? unformatCardText(detectCardGroup(text) ?? text) : formatSelectionAsCards(text);
    range.deleteContents();
    range.insertNode(document.createTextNode(replacement));
    setToolbar(null);
    window.getSelection()?.removeAllRanges();
    emit();
  };

  // Shared by every MarkdownToolbar action below — all of them read/replace
  // the current selection (or just the cursor position for headings/lists/
  // rule) the same way handleToolbarAction does above.
  const withCurrentRange = (run: (range: Range) => Node | null) => {
    const container = containerRef.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const inserted = run(range);
    if (inserted) {
      const after = document.createRange();
      after.setStartAfter(inserted);
      after.collapse(true);
      selection.removeAllRanges();
      selection.addRange(after);
    }
    container.focus();
    setToolbar(null);
    emit();
  };

  // Headings, blockquote, and both list styles are all "prefix the current
  // line with this text" — only what the prefix looks like differs. A
  // selection gets prefixed (each of its lines, for a multi-line one), not
  // discarded — an empty selection (just the cursor) only inserts the bare
  // prefix, ready for the tutor to start typing.
  const insertLinePrefix = (prefix: string) => {
    withCurrentRange((range) => {
      const prefixed = prefixLines(range.toString(), prefix);
      const atLineStart = isAtLineStart(containerRef.current!, range.startContainer, range.startOffset);
      const node = document.createTextNode(atLineStart ? prefixed : `\n${prefixed}`);
      range.deleteContents();
      range.insertNode(node);
      return node;
    });
  };

  const wrapSelection = (before: string, after = before) => {
    withCurrentRange((range) => {
      const node = document.createTextNode(`${before}${range.toString()}${after}`);
      range.deleteContents();
      range.insertNode(node);
      return node;
    });
  };

  const toolbarActions: MarkdownToolbarActions = {
    onHeading: (level) => insertLinePrefix(`${"#".repeat(level)} `),
    onBold: () => wrapSelection("**"),
    onItalic: () => wrapSelection("*"),
    onInlineCode: () => wrapSelection("`"),
    onBlockquote: () => insertLinePrefix("> "),
    onBulletList: () => insertLinePrefix("- "),
    onNumberedList: () => insertLinePrefix("1. "),
    onLink: () => {
      withCurrentRange((range) => {
        const text = range.toString() || t("linkPlaceholder");
        const node = document.createTextNode(`[${text}](url)`);
        range.deleteContents();
        range.insertNode(node);
        return node;
      });
    },
    onHorizontalRule: () => {
      withCurrentRange((range) => {
        const atLineStart = isAtLineStart(containerRef.current!, range.startContainer, range.startOffset);
        const node = document.createTextNode(`${atLineStart ? "" : "\n"}---\n`);
        range.deleteContents();
        range.insertNode(node);
        return node;
      });
    },
    onInsertEmoji: (emoji) => {
      withCurrentRange((range) => {
        const node = document.createTextNode(emoji);
        range.deleteContents();
        range.insertNode(node);
        return node;
      });
    },
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const range = caretRangeFromPoint(e.clientX, e.clientY);
    const target = range && container.contains(range.startContainer) ? range : document.createRange();
    if (target !== range) {
      target.selectNodeContents(container);
      target.collapse(false);
    }

    // Repositioning an image already in the text: move the exact chip node
    // (Range.insertNode removes a node from its old spot when it's already
    // in the document) rather than inserting a duplicate — see buildImageChip's
    // onDragStart/onDragEnd, which track this across the drag.
    const draggedChip = draggedChipRef.current;
    if (draggedChip) {
      draggedChipRef.current = null;
      target.insertNode(draggedChip);
      emit();
      return;
    }

    const dropped = e.dataTransfer.getData("text/plain");
    if (!dropped) return;
    const imageMatch = dropped.match(IMAGE_DROP_RE);
    target.insertNode(imageMatch ? createImageChip(imageMatch[1]) : document.createTextNode(dropped));
    emit();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    emit();
  };

  return (
    <div className="flex flex-col gap-1">
      <MarkdownToolbar actions={toolbarActions} />

      <div className="relative">
        {toolbar && (
          <button
            type="button"
            title={t(toolbar.mode === "unformat" ? "removeFormattingLabel" : "formatAsCard")}
            aria-label={t(toolbar.mode === "unformat" ? "removeFormattingLabel" : "formatAsCard")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleToolbarAction}
            style={{ top: toolbar.top, left: toolbar.left }}
            className="absolute z-10 flex -translate-y-full items-center justify-center rounded-md bg-gray-900 p-1.5 text-sm text-white shadow-lg"
          >
            {toolbar.mode === "unformat" ? <Eraser className="h-3.5 w-3.5" /> : "🔤"}
          </button>
        )}
        <div
          ref={containerRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onMouseUp={updateToolbarFromSelection}
          onKeyUp={updateToolbarFromSelection}
          onBlur={() => setToolbar(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onPaste={handlePaste}
          style={{ minHeight: `${rows * 1.5}rem`, whiteSpace: "pre-wrap" }}
          className="w-full overflow-y-auto rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
        />
      </div>
    </div>
  );
}
