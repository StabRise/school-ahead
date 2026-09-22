import { NextResponse } from "next/server";
import { getReading } from "@school-ahead/api-client/server/reading/reading";

// The single representative card (is_default=true) per reading.Syllable
// group, across every consonant — fetched once and cached client-side by
// lib/default-syllables.ts, which lib/syllable-card.tsx's WordSegmentCard
// uses to compose a "Казки"/Jumping Frogs inline syllable card (colored
// letters + object photo) for any known two-letter syllable it meets in a
// story's `{ва - н}`-style breakdown or a level's own syllable text.
// Replaces the old public/static/syllables/<consonant>/<syllable>.png
// hand-photographed lookup. Reachable without a session (excluded from the
// locale/auth middleware by its "/api" matcher, see middleware.ts) — the
// backend endpoint is auth=None for the same reason.
export interface DefaultSyllableRow {
  syllable: string; // e.g. "МО" — first_letter + second_part, uppercased
  image: string;
  word: string;
}

export async function GET() {
  const rows = await getReading()
    .listReadingSyllables({ is_default: true })
    .catch(() => []);

  const syllables: DefaultSyllableRow[] = rows
    .filter((row): row is typeof row & { icon: string } => Boolean(row.icon))
    .map((row) => ({
      syllable: `${row.first_letter}${row.second_part}`,
      image: row.icon,
      word: row.word,
    }));

  return NextResponse.json({ syllables });
}
