import { readdir, readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import type { FlashcardGroupSummary } from "@school-ahead/flashcards/types";

// The "Cards" study flashcards game's subject picker (docs/preschool/games/
// cards.md) — every subfolder of public/static/cards that has a title.json
// in it (e.g. public/static/cards/math/title.json: {"title": "Matematyka"})
// is a pickable group; a group folder with no title.json (like the
// still-empty public/static/cards/polski placeholder) is skipped rather
// than shown half-broken. Excluded from the locale/auth middleware by its
// "/api" matcher (see middleware.ts), so this is reachable without a
// session, same as /api/stories.
const CARDS_DIR = path.join(process.cwd(), "public", "static", "cards");
const TITLE_FILE = "title.json";

async function readGroupTitle(slug: string): Promise<string | null> {
  const content = await readFile(path.join(CARDS_DIR, slug, TITLE_FILE), "utf-8").catch(() => null);
  if (content === null) return null;
  try {
    const parsed = JSON.parse(content) as { title?: unknown };
    return typeof parsed.title === "string" && parsed.title.length > 0 ? parsed.title : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const entries = await readdir(CARDS_DIR, { withFileTypes: true }).catch(() => []);
  const folders = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."));

  const groups = await Promise.all(
    folders.map(async (entry): Promise<FlashcardGroupSummary | null> => {
      const title = await readGroupTitle(entry.name);
      return title ? { slug: entry.name, title } : null;
    }),
  );
  const ready = groups.filter((group): group is FlashcardGroupSummary => group !== null);
  ready.sort((a, b) => a.title.localeCompare(b.title, "uk"));

  return NextResponse.json({ groups: ready });
}
