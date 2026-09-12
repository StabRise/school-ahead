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
// backend/preschool/api.py), reachable here as a synthetic `story-<id>`
// slug (same "prefixed so it can never collide with a static folder name"
// convention as cards/api.py's `subject-{id}`/`topic-{id}` slugs).
// Excluded from the locale/auth middleware by its "/api" matcher (see
// middleware.ts), so this is reachable without a session — the backend
// list endpoint is auth=None for the same reason.
const STORIES_DIR = path.join(process.cwd(), "public", "static", "stories");
const STORY_FILE = "story.md";
const COVER_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
const DB_SLUG_PREFIX = "story-";

async function listDbStories(): Promise<StorySummary[]> {
  try {
    const rows = await getPreschool().listPreschoolStories();
    return rows.map((row) => ({
      slug: `${DB_SLUG_PREFIX}${row.id}`,
      title: row.title,
      cover: row.cover_image,
    }));
  } catch {
    // The backend may be unreachable (e.g. frontend-only local dev) — the
    // game should still show the static stories rather than erroring out.
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
