import { NextResponse } from "next/server";
import { getReading } from "@school-ahead/api-client/server/reading/reading";

// Temporary diagnostic for the "every server-side Django call returns
// empty on prod" bug (/api/stories, /api/story, /api/default-syllables,
// /api/cards-game-mode(s) all silently swallow their fetch failure and
// return an empty result — see those routes' console.error logging,
// which nobody has been able to read from a container shell). API_URL is
// not a secret (an internal Docker hostname, e.g. http://backend:8000),
// so it's safe to echo directly. Remove once the underlying connectivity
// issue is found and fixed.
export async function GET() {
  const info: Record<string, unknown> = {
    apiUrl: process.env.API_URL ?? null,
    nextPublicApiUrl: process.env.NEXT_PUBLIC_API_URL ?? null,
  };
  try {
    const consonants = await getReading().listReadingConsonants();
    info.ok = true;
    info.consonantsCount = consonants.length;
  } catch (err) {
    info.ok = false;
    info.errorName = err instanceof Error ? err.name : null;
    info.errorMessage = err instanceof Error ? err.message : String(err);
    info.errorCode = (err as { code?: string } | null)?.code ?? null;
    const response = (err as { response?: { status?: number; data?: unknown } } | null)?.response;
    if (response) {
      info.responseStatus = response.status;
      info.responseData = response.data;
    }
  }
  return NextResponse.json(info);
}
