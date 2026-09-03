import { access, readdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

// The "Cards" minigame's consonant list (components/preschool/cards-game.tsx,
// docs/preschool/games/reading/Cards.md) is every subfolder of
// public/static/letters that has a words.json alongside its card images — a
// freshly-sliced sheet (see backend's slice_flashcard_grid command) starts
// out as unnamed row0_colN.png files with no words.json, and isn't shown as
// a level until it's been named and captioned. Excluded from the
// locale/auth middleware by its "/api" matcher (see middleware.ts), so this
// is reachable without a session.
const LETTERS_DIR = path.join(process.cwd(), "public", "static", "letters");

async function hasWords(entryName: string): Promise<boolean> {
  return access(path.join(LETTERS_DIR, entryName, "words.json"))
    .then(() => true)
    .catch(() => false);
}

export async function GET() {
  const entries = await readdir(LETTERS_DIR, { withFileTypes: true }).catch(() => []);
  const directories = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."));
  const ready = await Promise.all(directories.map(async (entry) => ((await hasWords(entry.name)) ? entry.name : null)));
  const consonants = ready.filter((name): name is string => name !== null).sort((a, b) => a.localeCompare(b, "uk"));
  return NextResponse.json({ consonants });
}
