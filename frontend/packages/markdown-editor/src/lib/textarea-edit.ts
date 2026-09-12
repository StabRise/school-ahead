// Pure string/offset helpers backing markdown-editor.tsx's toolbar — the
// plain-<textarea> analogue of story/story-rich-text.ts's Range-based
// helpers (prefixLines, isAtLineStart) that back the contentEditable Story
// editor. Deliberately a separate module: a <textarea>'s editing surface is
// `value: string` + numeric `selectionStart`/`selectionEnd`, not a DOM
// Range, so the algorithms here operate on string indices instead of
// walking nodes — same toolbar semantics, different input model.

export interface TextEditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

// Wraps the selected substring in before/after markers (bold/italic/code).
// A non-empty selection is wrapped and reselected (so the toolbar button can
// be pressed again, or the text retyped, without hunting for it); an empty
// selection just inserts both markers with the cursor left between them,
// ready to type.
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string = before,
): TextEditResult {
  const selected = value.slice(start, end);
  const newValue = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;

  if (start === end) {
    const caret = start + before.length;
    return { value: newValue, selectionStart: caret, selectionEnd: caret };
  }

  return {
    value: newValue,
    selectionStart: start + before.length,
    selectionEnd: start + before.length + selected.length,
  };
}

// Replaces the selection with literal text (used for the horizontal rule,
// emoji, and link insertion), leaving the cursor collapsed right after it.
export function insertText(value: string, start: number, end: number, text: string): TextEditResult {
  const newValue = `${value.slice(0, start)}${text}${value.slice(end)}`;
  const caret = start + text.length;
  return { value: newValue, selectionStart: caret, selectionEnd: caret };
}

// Whether `index` is already at the start of a line — nothing before it, or
// the character right before it is a newline.
export function isAtLineStart(value: string, index: number): boolean {
  return index === 0 || value[index - 1] === "\n";
}

// Prefixes every line the selection touches (heading/blockquote/list
// buttons) — extends [start, end) out to the enclosing line boundaries
// first, so selecting the middle of a line still prefixes that whole line,
// then prefixes each line in that block and keeps the text (not discarded:
// a selection with nothing left to show for it once formatted is exactly
// the "text disappears, only the marker is left" bug this guards against).
// An empty selection (bare cursor) just gets the prefix inserted at the
// current line's start.
export function prefixLines(value: string, start: number, end: number, prefix: string): TextEditResult {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextNewline = value.indexOf("\n", end);
  const lineEnd = nextNewline === -1 ? value.length : nextNewline;

  const block = value.slice(lineStart, lineEnd);
  const prefixed = block
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");

  const newValue = `${value.slice(0, lineStart)}${prefixed}${value.slice(lineEnd)}`;
  return { value: newValue, selectionStart: lineStart, selectionEnd: lineStart + prefixed.length };
}
