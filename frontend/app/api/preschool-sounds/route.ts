import { readdir } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

// Lets the balloon-pop minigame (lib/preschool-sounds.ts) know which labels
// in a mode have real recorded pronunciations in public/preschool/<mode>/
// sounds instead of relying on Piper TTS synthesis — drop mp3s into a mode's
// public/preschool/<mode>/sounds folder and they're picked up automatically,
// no code change needed (same convention as /api/music-tracks). Excluded
// from the locale/auth middleware by its "/api" matcher (see middleware.ts),
// so this is reachable without a session.
//
// `mode` is restricted to a bare alphanumeric segment — it's interpolated
// straight into a filesystem path below, and BalloonMode values are always
// plain camelCase words (e.g. "greetings", "animals"), so anything else is
// rejected outright rather than risking path traversal.
const VALID_MODE = /^[a-zA-Z0-9]+$/;

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode");
  if (!mode || !VALID_MODE.test(mode)) return NextResponse.json({ names: [] });

  const soundsDir = path.join(process.cwd(), "public", "preschool", mode, "sounds");
  const names = await readdir(soundsDir)
    .then((files) =>
      files.filter((file) => file.toLowerCase().endsWith(".mp3")).map((file) => file.slice(0, -".mp3".length)),
    )
    .catch(() => []);
  return NextResponse.json({ names });
}
