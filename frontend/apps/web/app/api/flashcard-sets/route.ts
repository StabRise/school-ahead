import { readdir, readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { isValidFlashcardSlug, type FlashcardSet, type FlashcardSetSummary } from "@/lib/flashcard-types";

// One subject group's set picker (docs/preschool/games/cards.md) — every
// subfolder of public/static/cards/<group> that has a set.json in it (e.g.
// public/static/cards/math/7 klasa/set.json) is a pickable set. Excluded
// from the locale/auth middleware by its "/api" matcher (see
// middleware.ts), reachable without a session same as /api/stories.
//
// `group` is a bare folder name interpolated straight into a filesystem
// path below — rejected outright if it could escape CARDS_DIR, same
// isValidFlashcardSlug rule /api/flashcard-set applies to both its params.
const CARDS_DIR = path.join(process.cwd(), "public", "static", "cards");
const TITLE_FILE = "title.json";
const SET_FILE = "set.json";

async function readGroupTitle(groupDir: string): Promise<string | null> {
  const content = await readFile(path.join(groupDir, TITLE_FILE), "utf-8").catch(() => null);
  if (content === null) return null;
  try {
    const parsed = JSON.parse(content) as { title?: unknown };
    return typeof parsed.title === "string" && parsed.title.length > 0 ? parsed.title : null;
  } catch {
    return null;
  }
}

async function readSetSummary(setDir: string, slug: string): Promise<FlashcardSetSummary | null> {
  const content = await readFile(path.join(setDir, SET_FILE), "utf-8").catch(() => null);
  if (content === null) return null;
  try {
    const parsed = JSON.parse(content) as { set?: FlashcardSet };
    const set = parsed.set;
    if (!set || typeof set.title !== "string" || !Array.isArray(set.categories)) return null;
    const itemCount = set.categories.reduce((sum, category) => sum + (category.items?.length ?? 0), 0);
    return { slug, title: set.title, categoryCount: set.categories.length, itemCount };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const group = request.nextUrl.searchParams.get("group");
  if (!group || !isValidFlashcardSlug(group)) {
    return NextResponse.json({ groupTitle: null, sets: [] });
  }

  const groupDir = path.join(CARDS_DIR, group);
  const groupTitle = await readGroupTitle(groupDir);
  const entries = await readdir(groupDir, { withFileTypes: true }).catch(() => []);
  const folders = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."));

  const sets = await Promise.all(
    folders.map((entry) => readSetSummary(path.join(groupDir, entry.name), entry.name)),
  );
  const ready = sets.filter((set): set is FlashcardSetSummary => set !== null);
  ready.sort((a, b) => a.title.localeCompare(b.title, "uk"));

  return NextResponse.json({ groupTitle, sets: ready });
}
