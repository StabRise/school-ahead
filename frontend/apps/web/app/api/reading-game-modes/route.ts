import { readdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

// The reading (syllable drag-and-drop) minigame's consonant list
// (components/preschool/reading-game.tsx) is just whatever subfolders exist
// under public/static/letters — drop a new folder named after a
// consonant (e.g. "Т") full of <Word>.png images and it's a selectable
// level, no code change needed. Excluded from the locale/auth middleware by
// its "/api" matcher (see middleware.ts), so this is reachable without a
// session.
const LETTERS_DIR = path.join(process.cwd(), "public", "static", "letters");

export async function GET() {
  const entries = await readdir(LETTERS_DIR, { withFileTypes: true }).catch(() => []);
  const consonants = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "uk"));
  return NextResponse.json({ consonants });
}
