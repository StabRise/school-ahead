import { readdir } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getReading } from "@school-ahead/api-client/server/reading/reading";
import { readingGameLanguage } from "@/lib/reading-game-language";

// The reading (syllable drag-and-drop) minigame's consonant list
// (components/preschool/reading-game.tsx) is just whatever subfolders exist
// under public/static/letters — drop a new folder named after a
// consonant (e.g. "Т") full of <Word>.png images and it's a selectable
// level, no code change needed. Excluded from the locale/auth middleware by
// its "/api" matcher (see middleware.ts), so this is reachable without a
// session.
//
// `?language=` (the game's language setting, Ukrainian by default) adds
// every first_letter the DB has reading.Syllable cards for in that
// language (Django's public GET /api/reading/consonants — what the tutor
// /tutor/syllables ZIP import fills). The static folders are all
// Ukrainian, so they only count for "uk".
const LETTERS_DIR = path.join(process.cwd(), "public", "static", "letters");

async function staticConsonants(): Promise<string[]> {
  const entries = await readdir(LETTERS_DIR, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name);
}

export async function GET(request: NextRequest) {
  const language = readingGameLanguage(request);
  const [dbConsonants, folderConsonants] = await Promise.all([
    getReading()
      .listReadingConsonants({ language })
      .catch(() => [] as string[]),
    language === "uk" ? staticConsonants() : Promise.resolve([]),
  ]);
  const consonants = [...new Set([...folderConsonants, ...dbConsonants])].sort((a, b) =>
    a.localeCompare(b, language),
  );
  return NextResponse.json({ consonants });
}
