import { NextRequest, NextResponse } from "next/server";
import { getReading } from "@school-ahead/api-client/server/reading/reading";

// Everything the "Cards" minigame (components/preschool/cards-game.tsx)
// needs for one consonant level — every reading.Syllable card for that
// first_letter, from Django's public GET /api/reading/syllables (backend/
// reading/api.py). See docs/preschool/games/reading/Cards.md. Replaces the
// old public/static/syllables/<consonant>/{words.json,<syllable>.png} scan:
// a syllable's picture is now a plain object photo (Syllable.icon) composed
// live with colored syllable-letter text client-side, instead of a single
// hand-photographed image baking both together — see cards-game.tsx's
// syllableBadge. A syllable can now have more than one card (e.g. МО:
// Морква, Морозиво); `isDefault` flags the one Learning mode's fixed
// six-per-consonant grid uses (`toLearningCards` in cards-game.tsx).
// Reachable without a session (excluded from the locale/auth middleware by
// its "/api" matcher, see middleware.ts) — the backend endpoint is
// auth=None for the same reason.
const VALID_CONSONANT = /^[А-ЩЬЮЯЄІЇҐа-щьюяєіїґ]{1,3}$/u;

export interface CardsGameCard {
  syllable: string; // e.g. "МО" — first_letter + second_part, uppercased
  word: string;
  image: string;
  isDefault: boolean;
}

export interface CardsGameModeResponse {
  cards: CardsGameCard[];
}

const EMPTY_RESPONSE: CardsGameModeResponse = { cards: [] };

export async function GET(request: NextRequest) {
  const consonant = request.nextUrl.searchParams.get("folder");
  if (!consonant || !VALID_CONSONANT.test(consonant)) return NextResponse.json(EMPTY_RESPONSE);

  const rows = await getReading()
    .listReadingSyllables({ consonant })
    .catch(() => []);

  // A card with no icon yet can't be played (nothing to show/fall) — same
  // "not ready" skip the old words.json-driven route did for a syllable
  // missing its image.
  const cards: CardsGameCard[] = rows
    .filter((row): row is typeof row & { icon: string } => Boolean(row.icon))
    .map((row) => ({
      syllable: `${row.first_letter}${row.second_part}`,
      word: row.word,
      image: row.icon,
      isDefault: row.is_default,
    }));

  return NextResponse.json({ cards });
}
