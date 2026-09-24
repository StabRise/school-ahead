import type { NextRequest } from "next/server";
import { QuizLanguage } from "@school-ahead/api-client/server/schoolAheadAPI.schemas";

// The "Склади" game's `?language=` (its language setting, see
// preschool-games' reading-game-store.ts) — Ukrainian when missing or not
// one of backend lessons.models.QuizLanguage.
export function readingGameLanguage(request: NextRequest): QuizLanguage {
  const language = request.nextUrl.searchParams.get("language");
  return Object.values(QuizLanguage).includes(language as QuizLanguage) ? (language as QuizLanguage) : "uk";
}
