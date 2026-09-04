import { access, readdir, readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { parseStoryTitle, type StorySummary } from "@school-ahead/preschool-games/story-parser";

// The "Казки" minigame's story list (components/preschool/stories-game.tsx)
// is every subfolder of public/static/stories that has a story.md in it
// (see docs/preschool/games/reading/Stories.md) — a story's own folder
// name is its slug, and any image its story.md references (by filename)
// lives right alongside story.md in that same folder. Drop a new
// <name>/story.md in and it's in the picker without any code change.
// Excluded from the locale/auth middleware by its "/api" matcher (see
// middleware.ts), so this is reachable without a session.
const STORIES_DIR = path.join(process.cwd(), "public", "static", "stories");
const STORY_FILE = "story.md";
const COVER_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

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

  const stories = await Promise.all(
    folders.map(async (entry): Promise<StorySummary | null> => {
      const slug = entry.name;
      const content = await readFile(path.join(STORIES_DIR, slug, STORY_FILE), "utf-8").catch(() => null);
      if (content === null) return null;
      const cover = await findCover(slug);
      return { slug, title: parseStoryTitle(content) || slug, cover };
    }),
  );
  const ready = stories.filter((story): story is StorySummary => story !== null);
  ready.sort((a, b) => a.title.localeCompare(b.title, "uk"));

  return NextResponse.json({ stories: ready });
}
