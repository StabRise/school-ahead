import { access, readdir, readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getPreschool } from "@school-ahead/api-client/server/preschool/preschool";
import { parseStoryTitle, type StorySummary } from "@school-ahead/preschool-games/story-parser";

// The "Казки" minigame's story list (components/preschool/stories-game.tsx)
// merges two sources: every subfolder of public/static/stories that has a
// story.md in it (see docs/preschool/games/reading/Stories.md) — a story's
// own folder name is its slug, and any image its story.md references (by
// filename) lives right alongside story.md in that same folder, so
// dropping a new <name>/story.md in is enough, no code change needed — and
// every tutor-authored Story row from the backend's preschool app (see
// backend/preschool/api.py), reachable here by its own real `slug` field
// (backend/preschool/models.py auto-generates it from the title via
// transliteration, e.g. "Колобок" -> "kolobok"). Not prefixed/namespaced
// against the static folder names — the backend has no visibility into
// this directory to cross-check against, so a DB slug that happens to
// exactly match a static folder name would collide; see /api/story's
// same note. Considered unlikely in practice (auto-generated tutor slugs
// vs. the fixed, curated static folk-tale set) and not solved here.
// Excluded from the locale/auth middleware by its "/api" matcher (see
// middleware.ts), so this is reachable without a session — the backend
// list endpoint is auth=None for the same reason.
const STORIES_DIR = path.join(process.cwd(), "public", "static", "stories");
const STORY_FILE = "story.md";
const COVER_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

async function listDbStories(): Promise<StorySummary[]> {
  try {
    const rows = await getPreschool().listPreschoolStories();
    return rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      cover: row.cover_image,
    }));
  } catch (err) {
    // The backend may be genuinely unreachable (e.g. frontend-only local
    // dev) — the game should still show the static stories rather than
    // erroring out — but logging it means a *misconfigured* backend
    // (wrong API_URL, a deploy that's down) shows up in the frontend
    // container's logs instead of just silently dropping every DB story
    // from the list with no trace (see /api/story's identical logging).
    console.error("/api/stories: DB story list fetch failed", err);
    return [];
  }
}

// A story's cover art — components/preschool/story-book.tsx's picker card —
// is <slug>/cover.<ext>, extension-agnostic since it's just however the
// artwork got saved (see e.g. public/static/stories/Рукавичка/cover.png).
async function findCover(slug: string): Promise<string | null> {
  for (const ext of COVER_EXTENSIONS) {
    const filename = `cover.${ext}`;
    const exists = await access(path.join(STORIES_DIR, slug, filename))
      .then(() => true)
      .catch(() => false);
    if (exists) return `/static/stories/${encodeURIComponent(slug)}/${filename}`;
  }
  return null;
}

export async function GET() {
  const entries = await readdir(STORIES_DIR, { withFileTypes: true }).catch(() => []);
  const folders = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."));

  const [staticStories, dbStories] = await Promise.all([
    Promise.all(
      folders.map(async (entry): Promise<StorySummary | null> => {
        const slug = entry.name;
        const content = await readFile(path.join(STORIES_DIR, slug, STORY_FILE), "utf-8").catch(() => null);
        if (content === null) return null;
        const cover = await findCover(slug);
        return { slug, title: parseStoryTitle(content) || slug, cover };
      }),
    ),
    listDbStories(),
  ]);
  const ready = [
    ...staticStories.filter((story): story is StorySummary => story !== null),
    ...dbStories,
  ];
  ready.sort((a, b) => a.title.localeCompare(b.title, "uk"));

  return NextResponse.json({ stories: ready });
}
