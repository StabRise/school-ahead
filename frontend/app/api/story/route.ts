import { readdir, readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

// Raw content of one story file (components/preschool/stories-game.tsx,
// see docs/preschool/games/reading/Stories.md) — the client parses it via
// lib/story-parser.ts's parseStory, same module the list route
// (/api/stories) uses server-side to extract just the title. Reachable
// without a session (excluded from the locale/auth middleware by its "/api"
// matcher, see middleware.ts).
//
// `slug` is a bare filename stem — it's interpolated straight into a
// filesystem path below, so anything that could escape STORIES_DIR (path
// separators, "..", a leading ".") is rejected outright. Otherwise
// deliberately permissive (a slug is just whatever a story's .md file is
// named, e.g. "Ріпка" — see /api/stories), not restricted to ASCII.
const INVALID_SLUG_RE = /[/\\]/;
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const STORIES_DIR = path.join(process.cwd(), "public", "static", "stories");

function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 200 && !INVALID_SLUG_RE.test(slug) && slug !== "." && slug !== "..";
}

// A story's "[Image #25]" references (see lib/story-parser.ts) resolve to
// files under public/static/stories/<slug>/<N>.<ext> — a photographed card
// sheet per referenced number, extension-agnostic since it's just however
// the photo/scan got saved. Only numbered files are picked up; anything
// else in that folder (an .md draft, ...) is ignored.
async function findStoryImages(slug: string): Promise<Record<number, string>> {
  const imagesDir = path.join(STORIES_DIR, slug);
  const entries = await readdir(imagesDir, { withFileTypes: true }).catch(() => []);
  const images: Record<number, string> = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).slice(1).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext)) continue;
    const stem = entry.name.slice(0, -(ext.length + 1));
    if (!/^\d+$/.test(stem)) continue;
    images[Number(stem)] = `/static/stories/${encodeURIComponent(slug)}/${encodeURIComponent(entry.name)}`;
  }
  return images;
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug || !isValidSlug(slug)) return NextResponse.json({ content: null, images: {} });

  const [content, images] = await Promise.all([
    readFile(path.join(STORIES_DIR, `${slug}.md`), "utf-8").catch(() => null),
    findStoryImages(slug),
  ]);
  return NextResponse.json({ content, images });
}
