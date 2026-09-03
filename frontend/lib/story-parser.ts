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
// colored letters otherwise), but a segment written as an image filename
// (e.g. "img1.jpeg") instead pins that specific photographed card to that
// slot (e.g. an illustration that isn't one of letters/'s consonant+vowel
// syllables) — resolved against the story's own folder, public/static/
// stories/<slug>/<filename>.
export type StoryWordSegment = { kind: "text"; text: string } | { kind: "image"; filename: string };

// {...} always contains one or more "-"-separated segments — even a lone
// image reference like "{ img1.jpeg }" is a one-segment "word" (see
// parseSyllableGroup below), so there's no separate standalone "image" part
// kind: a photo instead of a letter card is just what one segment renders
// as.
export type StoryParagraphPart =
  | { kind: "text"; text: string }
  | { kind: "word"; segments: StoryWordSegment[] }; // e.g. {К - ВІ - Т - КА} -> 4 segments

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

// A segment (or, per parseSyllableGroup below, a whole {...} group) that's
// just an image filename — e.g. "img1.jpeg" living right next to story.md
// (docs/preschool/games/reading/Stories.md §3) — rather than a letter or
// syllable. Anchored both ends and excludes whitespace/braces so it only
// matches one clean filename token, never a run of several dash-separated
// segments (a filename itself is assumed not to contain "-", since that
// would otherwise be indistinguishable from a segment separator).
const IMAGE_FILENAME_RE = /^[^\s{}]+\.(jpe?g|png|webp|gif)$/i;

function parseWordSegment(raw: string): StoryWordSegment {
  return IMAGE_FILENAME_RE.test(raw) ? { kind: "image", filename: raw } : { kind: "text", text: raw };
}

// A {...} group's content is either one bare image filename (checked
// against the *whole*, untrimmed-of-dashes content first, so a filename
// itself may safely contain "-", e.g. "{ img-1.jpeg }") or, otherwise, the
// usual "-"-separated syllable/letter segments (any of which may itself be
// an image filename instead, e.g. "{К - img1.jpeg - Т - КА}").
function parseSyllableGroup(raw: string): StoryWordSegment[] {
  const trimmed = raw.trim();
  if (IMAGE_FILENAME_RE.test(trimmed)) return [{ kind: "image", filename: trimmed }];
  return trimmed
    .split("-")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map(parseWordSegment);
}

export function parseStoryParagraph(text: string): StoryParagraph {
  const parts: StoryParagraphPart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(SYLLABLE_GROUP_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ kind: "text", text: text.slice(lastIndex, index) });
    const segments = parseSyllableGroup(match[1]);
    if (segments.length > 0) parts.push({ kind: "word", segments });
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
