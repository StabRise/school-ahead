// Pure parsing for the preschool "Казки" (Stories) minigame — see
// docs/preschool/games/reading/Stories.md. No React/DOM here (unlike
// lib/story.ts's fetch hooks or lib/story-markdown.ts's remark plugin) so
// this is trivially unit-testable and safe to import from both the client
// and the server (the /api/story* route handlers, for extracting a list
// entry's title without shipping a second parser).

export interface StorySummary {
  slug: string;
  title: string;
  // URL of <slug>/cover.<ext>, resolved server-side (see /api/stories) —
  // null when the story has no cover art yet. Shown on the picker's book
  // (components/preschool/story-book.tsx).
  cover: string | null;
}

// One card within a {...} word breakdown — most segments are just a
// letter/syllable (rendered per docs/preschool/games/reading/Stories.md §3:
// the syllables/ flashcard image for a known two-letter syllable, plain
// colored letters otherwise), but a segment written as an image filename
// (e.g. "img1.jpeg") instead pins that specific photographed card to that
// slot (e.g. an illustration that isn't one of syllables/'s consonant+vowel
// syllables) — resolved against the story's own folder, public/static/
// stories/<slug>/<filename>. A segment written as a sound filename (e.g.
// "koza.mp3", resolved the same way) is a read-aloud clip instead — only
// meaningful as a lone {...} group (see stories-game.tsx's isAudio), never
// mixed into a syllable breakdown. A segment written as a video filename
// (e.g. "1.avi", resolved the same way) is a short looping clip instead of
// a still illustration — same "only meaningful as a lone {...} group" rule
// as audio (see stories-game.tsx's isVideo).
export type StoryWordSegment =
  | { kind: "text"; text: string }
  | { kind: "image"; filename: string }
  | { kind: "audio"; filename: string }
  | { kind: "video"; filename: string };

export interface Story {
  title: string;
  // An extra heading line alongside the title, e.g. an adaptation/author
  // credit written as its own "### ..." line before the real "# Title"
  // (see parseStory below) — undefined when the file has only one heading
  // line.
  subtitle?: string;
  // Everything after the leading heading line(s), completely unparsed —
  // rendered as real Markdown by lib/story-markdown.ts's remarkStoryCards
  // + react-markdown (see components/preschool/stories-game.tsx), which is
  // also where "{...}" groups within it turn into cards.
  body: string;
}

// A segment (or, per parseSyllableGroup below, a whole {...} group) that's
// just an image filename — e.g. "img1.jpeg" living right next to story.md
// (docs/preschool/games/reading/Stories.md §3) — rather than a letter or
// syllable. Anchored both ends and excludes whitespace/braces so it only
// matches one clean filename token, never a run of several dash-separated
// segments (a filename itself is assumed not to contain "-", since that
// would otherwise be indistinguishable from a segment separator).
const IMAGE_FILENAME_RE = /^[^\s{}]+\.(jpe?g|png|webp|gif)$/i;

// Same idea as IMAGE_FILENAME_RE but for a sound clip living next to
// story.md (e.g. "koza.mp3") — a {...} group naming one of these renders as
// an inline play button (StoryCard in stories-game.tsx) instead of a
// picture/syllable card.
const AUDIO_FILENAME_RE = /^[^\s{}]+\.(mp3|wav|ogg|m4a)$/i;

// Same idea again but for a short video clip (e.g. "1.avi", "1.mp4") — a
// {...} group naming one of these renders as an inline looping clip
// (StoryVideo in stories-game.tsx) instead of a still picture.
const VIDEO_FILENAME_RE = /^[^\s{}]+\.(mp4|webm|mov|avi)$/i;

function parseWordSegment(raw: string): StoryWordSegment {
  if (IMAGE_FILENAME_RE.test(raw)) return { kind: "image", filename: raw };
  if (AUDIO_FILENAME_RE.test(raw)) return { kind: "audio", filename: raw };
  if (VIDEO_FILENAME_RE.test(raw)) return { kind: "video", filename: raw };
  return { kind: "text", text: raw };
}

// A {...} group's content is either one bare image/audio/video filename
// (checked against the *whole*, untrimmed-of-dashes content first, so a
// filename itself may safely contain "-", e.g. "{ img-1.jpeg }") or,
// otherwise, the usual "-"-separated syllable/letter segments (any of which
// may itself be an image/audio/video filename instead, e.g.
// "{К - img1.jpeg - Т - КА}"). Called by lib/story-markdown.ts's remark
// plugin once per "{...}" it finds anywhere in the story's Markdown body —
// a word breakdown is a Markdown *extension* on top of real Markdown, not
// something parseStory itself looks for.
export function parseSyllableGroup(raw: string): StoryWordSegment[] {
  const trimmed = raw.trim();
  if (IMAGE_FILENAME_RE.test(trimmed)) return [{ kind: "image", filename: trimmed }];
  if (AUDIO_FILENAME_RE.test(trimmed)) return [{ kind: "audio", filename: trimmed }];
  if (VIDEO_FILENAME_RE.test(trimmed)) return [{ kind: "video", filename: trimmed }];
  return trimmed
    .split("-")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map(parseWordSegment);
}

const HEADING_LINE_RE = /^(#+)\s*(.*)$/;

// A story file is one or more leading "#"-heading lines (blank lines
// between them are fine — see Ріпка's "### <adaptation credit>" line
// before its "# Ріпка" title) followed by the story's Markdown body. The
// title is whichever leading heading has the fewest "#" (a "# Title"
// always outranks a "### credit line" regardless of which comes first in
// the file); any other leading heading becomes the subtitle. Only this
// leading run is special-cased — a "#" heading anywhere in the body itself
// renders as a normal Markdown heading (see lib/story-markdown.ts).
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

  const body = lines.slice(bodyStartLine).join("\n").trim();
  return { title, subtitle, body };
}

export function parseStoryTitle(markdown: string): string {
  return parseStory(markdown).title;
}
