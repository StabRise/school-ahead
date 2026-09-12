// components/tutor/story-rich-text-editor.tsx builds a contentEditable
// surface where an inserted picture's "{ <url> }" card (see
// lib/story-parser.ts's grammar) renders as an actual inline <img> chip
// instead of raw braces-and-url text — a "rich text editor"-style view —
// while Story.content in the DB still stores the plain "{ <url> }" text
// (see serializeContainer, which turns the chip back into that text).
// Only ever matches an image extension — audio/video/syllable "{...}"
// groups stay as plain visible text in that editor, unaffected.
export const IMAGE_CARD_RE = /\{\s*(https?:\/\/[^\s{}]+\.(?:jpe?g|png|webp|gif))\s*\}/gi;

export interface TextSegment {
  type: "text";
  text: string;
}
export interface ImageSegment {
  type: "image";
  url: string;
}
export type StorySegment = TextSegment | ImageSegment;

// Splits raw Story.content into the ordered text/image-chip segments the
// rich editor mounts as its initial DOM content.
export function splitIntoSegments(value: string): StorySegment[] {
  const segments: StorySegment[] = [];
  let lastIndex = 0;
  for (const match of value.matchAll(IMAGE_CARD_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) segments.push({ type: "text", text: value.slice(lastIndex, index) });
    segments.push({ type: "image", url: match[1] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < value.length) segments.push({ type: "text", text: value.slice(lastIndex) });
  return segments;
}

// Reconstructs the plain-text representation from the live contentEditable
// DOM — walks child nodes, turning an image chip (an element carrying
// `dataset.imageUrl`, see story-rich-text-editor.tsx's buildImageChip) back
// into its "{ <url> }" text, and a <br> (a newline, either ours or the
// browser's own) into "\n". Any other wrapping element (some browsers still
// wrap a line in its own <div>/<p> despite defaultParagraphSeparator being
// set to "br") is recursed into and treated as its own line, so content
// isn't silently dropped even if that happens.
export function serializeContainer(container: Node): string {
  let result = "";
  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? "";
    } else if (node instanceof HTMLElement) {
      if (node.dataset.imageUrl) {
        result += `{ ${node.dataset.imageUrl} }`;
      } else if (node.tagName === "BR") {
        result += "\n";
      } else {
        result += `${serializeContainer(node)}\n`;
      }
    }
  }
  return result;
}

const FULL_CARD_GROUP_RE = /^\{([^{}]*)\}$/;

// Whether a selected string is exactly one "{...}" card, braces included
// (e.g. selecting the full "{ш-та-н-ці}") — used by
// story-rich-text-editor.tsx to show a "remove formatting" button instead
// of "format as card" when the tutor's selection is already one.
export function detectCardGroup(text: string): string | null {
  const match = text.match(FULL_CARD_GROUP_RE);
  return match ? match[1] : null;
}

// The plain-text inverse of formatSelectionAsCards (lib/story-card-format.ts)
// — strips the dashes a syllable/letter breakdown card has between its
// segments (e.g. "ш-та-н-ці" -> "штанці"), so "remove formatting" restores
// the original word rather than leaving the dashes behind. A no-op for a
// card with no dashes (e.g. a lone audio/video/YouTube reference).
export function unformatCardText(raw: string): string {
  return raw.replace(/-/g, "");
}

// The character (or "\n" for a <br>) immediately before a (node, offset)
// point — null at the very start of `container` (nothing precedes it).
// Walks backward through preceding siblings and up through ancestors (up
// to `container`) as needed. Used by isAtLineStart below.
export function charBeforeCursor(container: Node, node: Node, offset: number): string | null {
  let current: Node = node;
  let currentOffset = offset;

  while (true) {
    if (current.nodeType === Node.TEXT_NODE && currentOffset > 0) {
      return (current.textContent ?? "")[currentOffset - 1] ?? null;
    }

    const parent: Node | null = current.nodeType === Node.TEXT_NODE ? current.parentNode : current;
    if (!parent) return null;
    const children = Array.from(parent.childNodes);
    const indexInParent = current.nodeType === Node.TEXT_NODE ? children.indexOf(current as ChildNode) : currentOffset;
    const previous = children[indexInParent - 1];

    if (!previous) {
      if (parent === container) return null;
      current = parent;
      currentOffset = 0;
      continue;
    }
    if (previous.nodeType === Node.ELEMENT_NODE && (previous as HTMLElement).tagName === "BR") return "\n";
    if (previous.nodeType === Node.TEXT_NODE) {
      const text = previous.textContent ?? "";
      if (text.length > 0) return text[text.length - 1];
      current = previous; // empty text node — transparent, keep walking back
      currentOffset = 0;
      continue;
    }
    return "￼"; // an atomic element (e.g. an image chip) sits right before it
  }
}

// Whether a cursor position is already at the start of a line — nothing
// before it, or the character right before it is a newline — so
// story-rich-text-editor.tsx's heading/horizontal-rule toolbar buttons know
// whether they need to insert a leading "\n" first.
export function isAtLineStart(container: Node, node: Node, offset: number): boolean {
  const before = charBeforeCursor(container, node, offset);
  return before === null || before === "\n";
}

// The MarkdownToolbar heading/blockquote/list buttons all "prefix the
// current line with this text" — for a selection, that means prefixing
// each of its lines and keeping the selected text (not discarding it: a
// selection with nothing to show for it once formatted is exactly the "text
// disappears, only the bullet/heading marker is left" bug this guards
// against); for a bare cursor (no selection), it's just the prefix on its
// own, ready for the tutor to start typing.
export function prefixLines(selectedText: string, prefix: string): string {
  if (!selectedText) return prefix;
  return selectedText
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}
