// Pure parsing for the preschool "Казки" (Stories) minigame — see
// docs/preschool/games/reading/Stories.md. No React/DOM here (unlike
// lib/story.ts's fetch hooks) so this is trivially unit-testable and safe to
// import from both the client (lib/story.ts) and the server (the /api/story*
// route handlers, for extracting a list entry's title without shipping a
// second parser).

export interface StorySummary {
  slug: string;
  title: string;
}

// One card within a {...} word breakdown — most segments are just a
// letter/syllable (rendered per docs/preschool/games/reading/Stories.md §3:
// the letters/ flashcard image for a known two-letter syllable, plain
// colored letters otherwise), but a segment written as "[Image #N]" instead
// pins a specific photographed card to that slot (e.g. an illustration that
// isn't one of letters/'s consonant+vowel syllables) — see Story.images.
export type StoryWordSegment = { kind: "text"; text: string } | { kind: "image"; number: number };

export type StoryParagraphPart =
  | { kind: "text"; text: string }
  | { kind: "word"; segments: StoryWordSegment[] } // e.g. {К - ВІ - Т - КА} -> 4 segments
  | { kind: "image"; number: number }; // e.g. [Image #25] -> 25 — a photographed card sheet, see Story.images

export interface StoryParagraph {
  parts: StoryParagraphPart[];
}

export interface Story {
  title: string;
  // An extra heading line alongside the title, e.g. an adaptation/author
  // credit written as its own "### ..." line before the real "# Title"
  // (see parseStory below) — undefined when the file has only one heading
  // line.
  subtitle?: string;
  paragraphs: StoryParagraph[];
}

// A word broken into syllables for read-aloud practice, e.g. "{ві - н}" or
// "{К - ВІ - Т - КА}" — segment count and casing are whatever the story's
// author wrote (docs/preschool/games/reading/Stories.md §3), normalized by
// the renderer, not here.
const SYLLABLE_GROUP_RE = /\{([^}]+)\}/g;

// A photographed card sheet for one word (docs/preschool/games/reading/
// Stories.md §3) — the same "draw it on paper, photograph it" workflow as
// public/static/letters' sheets (see backend's slice_flashcard_grid
// command), just referenced by number instead of sliced into per-syllable
// files. Written the way pasting a document with inline images into plain
// text usually renders them ("[Image #25]"), case/spacing-insensitively.
const IMAGE_REF_RE = /\[image\s*#?\s*(\d+)\]/gi;

// Same shape as IMAGE_REF_RE but anchored to match a whole string exactly
// (no "g" flag — this is used once per segment via .match, not scanned
// across a larger string, so it doesn't need IMAGE_REF_RE's own lastIndex
// statefulness) — used to recognize a lone "[Image #N]" word-breakdown
// segment (see parseWordSegment below), as opposed to IMAGE_REF_RE finding
// one anywhere inside running paragraph text.
const IMAGE_REF_WHOLE_RE = /^\[image\s*#?\s*(\d+)\]$/i;

// Matches whichever of the two inline markers comes first — combining them
// into one alternation (rather than running SYLLABLE_GROUP_RE and
// IMAGE_REF_RE as two separate passes) keeps their relative order in the
// source text intact.
const INLINE_MARKER_RE = new RegExp(`${SYLLABLE_GROUP_RE.source}|${IMAGE_REF_RE.source}`, "gi");

function parseWordSegment(raw: string): StoryWordSegment {
  const match = raw.match(IMAGE_REF_WHOLE_RE);
  return match ? { kind: "image", number: Number(match[1]) } : { kind: "text", text: raw };
}

export function parseStoryParagraph(text: string): StoryParagraph {
  const parts: StoryParagraphPart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_MARKER_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ kind: "text", text: text.slice(lastIndex, index) });

    const [, syllableGroup, imageNumber] = match;
    if (syllableGroup !== undefined) {
      const segments = syllableGroup
        .split("-")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .map(parseWordSegment);
      if (segments.length > 0) parts.push({ kind: "word", segments });
    } else if (imageNumber !== undefined) {
      parts.push({ kind: "image", number: Number(imageNumber) });
    }

    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ kind: "text", text: text.slice(lastIndex) });
  return { parts };
}

const HEADING_LINE_RE = /^(#+)\s*(.*)$/;

// A story file is one or more leading "#"-heading lines (blank lines
// between them are fine — see Ріпка.md's "### <adaptation credit>" line
// before its "# Ріпка" title) followed by blank-line-separated paragraphs —
// deliberately not a general Markdown parser, just this one fixed shape
// (docs/preschool/games/reading/Stories.md §3). The title is whichever
// leading heading has the fewest "#" (a "# Title" always outranks a
// "### credit line" regardless of which comes first in the file); any
// other leading heading becomes the subtitle.
export function parseStory(markdown: string): Story {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  const headings: { level: number; text: string }[] = [];
  let bodyStartLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") {
      bodyStartLine = i + 1;
      continue;
    }
    const match = line.match(HEADING_LINE_RE);
    if (!match) break;
    headings.push({ level: match[1].length, text: match[2].trim() });
    bodyStartLine = i + 1;
  }

  let title = "";
  let subtitle: string | undefined;
  if (headings.length > 0) {
    const titleHeading = headings.reduce((best, heading) => (heading.level < best.level ? heading : best));
    title = titleHeading.text;
    const rest = headings.filter((heading) => heading !== titleHeading).map((heading) => heading.text);
    if (rest.length > 0) subtitle = rest.join(" · ");
  }

  const paragraphs = lines
    .slice(bodyStartLine)
    .join("\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(parseStoryParagraph);

  return { title, subtitle, paragraphs };
}

export function parseStoryTitle(markdown: string): string {
  return parseStory(markdown).title;
}
