import { readdir } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

// Everything the reading minigame (components/preschool/reading-game.tsx)
// needs for one consonant level, read straight from its folder under
// public/static/reading-game/<consonant> — no hardcoded vocabulary anywhere
// in the app. Reachable without a session (excluded from the locale/auth
// middleware by its "/api" matcher, see middleware.ts).
//
// A consonant folder looks like:
//   <consonant>/<Word>.png   — a picture card, filename is the whole word
//
// A card's syllable is its word's first two letters, uppercased (Ukrainian
// consonant+vowel syllables, e.g. "Мед.png" -> "МЕ", "Миша.png" -> "МИ") —
// there's no separate syllable field to author, it's derived from the
// filename itself. Several words can (and are meant to) share a syllable
// (e.g. "Морква.png" and "Морозиво.png" both -> "МО") so a level can have
// more picture cards than distinct syllables, per docs/preschool/games/
// reading/README.md.
//
// `consonant` is restricted to a short run of Cyrillic letters — it's
// interpolated straight into a filesystem path below, and every level
// folder name in this app matches that shape, so anything else (path
// separators, "..", ...) is rejected outright.
const VALID_CONSONANT = /^[А-ЩЬЮЯЄІЇҐа-щьюяєіїґ]{1,3}$/u;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const READING_GAME_DIR = path.join(process.cwd(), "public", "static", "reading-game");

export interface ReadingGameCard {
  key: string; // the word, e.g. "Мед" — also its image's filename minus extension
  image: string;
  syllable: string; // e.g. "МЕ"
}

function syllableOf(word: string): string {
  return word.slice(0, 2).toLocaleUpperCase("uk");
}

export async function GET(request: NextRequest) {
  const consonant = request.nextUrl.searchParams.get("folder");
  if (!consonant || !VALID_CONSONANT.test(consonant)) return NextResponse.json({ cards: [] });

  const folderDir = path.join(READING_GAME_DIR, consonant);
  const entries = await readdir(folderDir, { withFileTypes: true }).catch(() => []);

  const cards: ReadingGameCard[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name);
    if (!IMAGE_EXTENSIONS.has(ext.toLowerCase())) continue;
    const word = entry.name.slice(0, -ext.length);
    if (word.length < 2) continue;
    cards.push({
      key: word,
      image: `/static/reading-game/${consonant}/${entry.name}`,
      syllable: syllableOf(word),
    });
  }
  cards.sort((a, b) => a.key.localeCompare(b.key, "uk"));

  return NextResponse.json({ cards });
}
