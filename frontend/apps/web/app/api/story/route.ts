import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getPreschool } from "@school-ahead/api-client/server/preschool/preschool";

// Raw content of one story's story.md (components/preschool/
// stories-game.tsx, see docs/preschool/games/reading/Stories.md) — the
// client parses it via lib/story-parser.ts's parseStory, same module the
// list route (/api/stories) uses server-side to extract just the title.
// Any image the story references (by filename, e.g. "{ img1.jpeg }") lives
// right next to story.md under public/static/stories/<slug>/ and is served
// as a plain static file — no separate route needed to resolve it, the
// client just builds that URL directly. Reachable without a session
// (excluded from the locale/auth middleware by its "/api" matcher, see
// middleware.ts).
//
// A `story-<id>` slug (see /api/stories's DB_SLUG_PREFIX) is a DB-backed
// Story instead — fetched from the backend's preschool app (auth=None, same
// reason) rather than the filesystem, with its title/subtitle re-assembled
// into the same leading-"#"-heading-line(s) shape parseStory expects, so it
// parses identically to a static story.md. Its content already embeds any
// inserted image as an absolute URL (see stories-game.tsx's storyAssetUrl),
// not a bare filename, so no further path resolution is needed here.
//
// `slug` is a bare folder name — it's interpolated straight into a
// filesystem path below, so anything that could escape STORIES_DIR (path
// separators, "..", a leading ".") is rejected outright. Otherwise
// deliberately permissive (a slug is just whatever a story's folder is
// named, e.g. "Ріпка" — see /api/stories), not restricted to ASCII.
const INVALID_SLUG_RE = /[/\\]/;
const STORIES_DIR = path.join(process.cwd(), "public", "static", "stories");
const STORY_FILE = "story.md";
const DB_SLUG_RE = /^story-(\d+)$/;

function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 200 && !INVALID_SLUG_RE.test(slug) && slug !== "." && slug !== "..";
}

async function fetchDbStoryContent(storyId: number): Promise<string | null> {
  try {
    const story = await getPreschool().getPreschoolStory(storyId);
    const headingLines = [`# ${story.title}`, ...(story.subtitle ? [`### ${story.subtitle}`] : [])];
    return `${headingLines.join("\n\n")}\n\n${story.content}`;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug || !isValidSlug(slug)) return NextResponse.json({ content: null });

  const dbMatch = slug.match(DB_SLUG_RE);
  const content = dbMatch
    ? await fetchDbStoryContent(Number(dbMatch[1]))
    : await readFile(path.join(STORIES_DIR, slug, STORY_FILE), "utf-8").catch(() => null);
  return NextResponse.json({ content });
}
