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
// Tries the DB first (backend/preschool/api.py's get_story, auth=None, same
// reason — looked up by its own real `slug` field, see /api/stories) since
// that's a single indexed lookup; a 404/unreachable backend falls through
// to the filesystem. DB content is re-assembled with its title/subtitle
// into the same leading-"#"-heading-line(s) shape parseStory expects, so it
// parses identically to a static story.md, and already references any
// inserted asset as a "/api/story-asset/<name>" path (see that route and
// stories-game.tsx's storyAssetUrl), not a bare filename, so no further
// path resolution is needed for it here. Not
// prefixed/namespaced against static folder names (see /api/stories's note
// on the same trade-off) — a DB slug that happens to match a static folder
// name would resolve to the DB story, since that's checked first.
//
// `slug` is also used as a bare folder name for the filesystem fallback —
// it's interpolated straight into a filesystem path below, so anything
// that could escape STORIES_DIR (path separators, "..", a leading ".") is
// rejected outright. Otherwise deliberately permissive (a static slug is
// just whatever a story's folder is named, e.g. "Ріпка" — see
// /api/stories), not restricted to ASCII.
//
// `?source=db` (the "Storybook" games/storybook page, see game-play-page.
// tsx's StorybookGamePage) skips the filesystem fallback entirely — a slug
// that isn't a published DB story resolves to `content: null`, even if a
// same-named static folder exists.
const INVALID_SLUG_RE = /[/\\]/;
const STORIES_DIR = path.join(process.cwd(), "public", "static", "stories");
const STORY_FILE = "story.md";

function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 200 && !INVALID_SLUG_RE.test(slug) && slug !== "." && slug !== "..";
}

async function fetchDbStoryContent(slug: string): Promise<string | null> {
  try {
    const story = await getPreschool().getPreschoolStory(slug);
    const headingLines = [`# ${story.title}`, ...(story.subtitle ? [`### ${story.subtitle}`] : [])];
    return `${headingLines.join("\n\n")}\n\n${story.content}`;
  } catch (err) {
    // A 404 here just means "not a DB story" (or not published) and is the
    // expected shape of the static-folder fallback below — but every other
    // failure (backend unreachable, API_URL misconfigured, a timeout) was
    // previously silently swallowed the same way, making a DB story that
    // mysteriously falls back to "not found" impossible to diagnose from
    // the frontend container's own logs. Log everything but the routine 404.
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status !== 404) console.error(`/api/story: DB lookup failed for slug "${slug}"`, err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug || !isValidSlug(slug)) return NextResponse.json({ content: null });
  const dbOnly = request.nextUrl.searchParams.get("source") === "db";

  const dbContent = await fetchDbStoryContent(slug);
  const content =
    dbContent ?? (dbOnly ? null : await readFile(path.join(STORIES_DIR, slug, STORY_FILE), "utf-8").catch(() => null));
  return NextResponse.json({ content });
}
