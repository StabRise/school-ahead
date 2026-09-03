import { readdir, readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { parseStoryTitle } from "@/lib/story-parser";

// The "Казки" minigame's story list (components/preschool/stories-game.tsx)
// is every .md file under public/static/stories (see docs/preschool/games/
// reading/Stories.md) — drop a new file in and it's picker without any code
// change. Excluded from the locale/auth middleware by its "/api" matcher
// (see middleware.ts), so this is reachable without a session.
const STORIES_DIR = path.join(process.cwd(), "public", "static", "stories");

export async function GET() {
  const entries = await readdir(STORIES_DIR, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"));

  const stories = await Promise.all(
    files.map(async (entry) => {
      const slug = entry.name.slice(0, -3);
      const content = await readFile(path.join(STORIES_DIR, entry.name), "utf-8").catch(() => "");
      return { slug, title: parseStoryTitle(content) || slug };
    }),
  );
  stories.sort((a, b) => a.title.localeCompare(b.title, "uk"));

  return NextResponse.json({ stories });
}
