import { NextResponse } from "next/server";
import { getReading } from "@school-ahead/api-client/server/reading/reading";

// The "Cards" minigame's consonant list (components/preschool/cards-game.tsx,
// docs/preschool/games/reading/Cards.md) — every reading.Syllable
// first_letter with at least one card, from Django's public GET
// /api/reading/consonants (backend/reading/api.py). Replaces the old
// public/static/syllables folder scan now that both "Картки" and "Казки"
// (lib/syllable-card.tsx) read Syllable content instead of hand-photographed
// composite images. Excluded from the locale/auth middleware by its "/api"
// matcher (see middleware.ts), so this is reachable without a session — the
// backend endpoint is auth=None for the same reason.
const EMPTY_RESPONSE = { consonants: [] as string[] };

export async function GET() {
  const consonants = await getReading()
    .listReadingConsonants()
    .catch(() => EMPTY_RESPONSE.consonants);
  return NextResponse.json({ consonants });
}
