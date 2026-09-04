import { access, readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

// Everything the "Cards" minigame (components/preschool/cards-game.tsx)
// needs for one consonant level, read straight from its folder under
// public/static/syllables/<consonant> — see docs/preschool/games/reading/
// Cards.md. A folder looks like:
//   <consonant>/words.json      — { "<склад>": "<назва предмета>", ... },
//                                  e.g. { "ба": "баран" }
//   <consonant>/<склад>.png     — the flashcard image for that syllable
//                                  (syllable text + picture already baked
//                                  in by backend's slice_flashcard_grid
//                                  command), filename matches the words.json
//                                  key exactly
// Reachable without a session (excluded from the locale/auth middleware by
// its "/api" matcher, see middleware.ts).
//
// `consonant` is restricted to a single Cyrillic letter — it's interpolated
// straight into a filesystem path below, and every folder name under
// public/static/syllables matches that shape, so anything else (path
// separators, "..", ...) is rejected outright.
const VALID_CONSONANT = /^[А-ЩЬЮЯЄІЇҐа-щьюяєіїґ]{1,3}$/u;
const SYLLABLES_DIR = path.join(process.cwd(), "public", "static", "syllables");

export interface CardsGameCard {
  syllable: string; // e.g. "ба" — also the image's filename minus extension
  word: string; // e.g. "баран" — empty when the syllable has no illustration yet
  image: string;
}

export interface CardsGameModeResponse {
  cards: CardsGameCard[];
}

const EMPTY_RESPONSE: CardsGameModeResponse = { cards: [] };

export async function GET(request: NextRequest) {
  const consonant = request.nextUrl.searchParams.get("folder");
  if (!consonant || !VALID_CONSONANT.test(consonant)) return NextResponse.json(EMPTY_RESPONSE);

  const folderDir = path.join(SYLLABLES_DIR, consonant);
  const words = await readFile(path.join(folderDir, "words.json"), "utf-8")
    .then((raw) => JSON.parse(raw) as Record<string, string>)
    .catch(() => null);
  if (!words) return NextResponse.json(EMPTY_RESPONSE);

  const cards: CardsGameCard[] = [];
  for (const [syllable, word] of Object.entries(words)) {
    const imagePath = path.join(folderDir, `${syllable}.png`);
    const exists = await access(imagePath).then(() => true).catch(() => false);
    if (!exists) continue;
    cards.push({ syllable, word, image: `/static/syllables/${consonant}/${encodeURIComponent(`${syllable}.png`)}` });
  }

  return NextResponse.json({ cards });
}
