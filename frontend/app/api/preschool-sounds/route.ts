import { readdir } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

// Lets the balloon-pop minigame (lib/preschool-sounds.ts) know which labels
// in a mode's asset folder have real recorded pronunciations instead of
// relying on Piper TTS synthesis — drop mp3s into public/preschool/<folder>/
// <language>/sounds and they're picked up automatically, no code change
// needed. Falls back to the legacy, language-agnostic public/preschool/
// <folder>/sounds (same convention as /api/music-tracks) for a folder that
// hasn't opted into per-language content yet — e.g. "greetings" has no
// per-language variants, so its recordings are read once for every game
// language. Excluded from the locale/auth middleware by its "/api" matcher
// (see middleware.ts), so this is reachable without a session.
//
// `folder`/`language` are restricted to a bare alphanumeric-plus-hyphen
// segment — interpolated straight into a filesystem path below, and every
// value either can take (asset folder names, "en"/"uk"/"pl") matches that
// shape, so anything else is rejected outright rather than risking path
// traversal.
const VALID_SEGMENT = /^[a-zA-Z0-9-]+$/;

async function listMp3Names(dir: string): Promise<string[] | null> {
  return readdir(dir)
    .then((files) => files.filter((file) => file.toLowerCase().endsWith(".mp3")).map((file) => file.slice(0, -4)))
    .catch(() => null);
}

export async function GET(request: NextRequest) {
  const folder = request.nextUrl.searchParams.get("folder");
  const language = request.nextUrl.searchParams.get("language");
  if (!folder || !VALID_SEGMENT.test(folder) || !language || !VALID_SEGMENT.test(language)) {
    return NextResponse.json({ names: [], soundsPath: null });
  }

  const base = path.join(process.cwd(), "public", "preschool", folder);

  const nested = await listMp3Names(path.join(base, language, "sounds"));
  if (nested !== null) {
    return NextResponse.json({ names: nested, soundsPath: `/preschool/${folder}/${language}/sounds` });
  }

  const flat = await listMp3Names(path.join(base, "sounds"));
  if (flat !== null) {
    return NextResponse.json({ names: flat, soundsPath: `/preschool/${folder}/sounds` });
  }

  return NextResponse.json({ names: [], soundsPath: null });
}
