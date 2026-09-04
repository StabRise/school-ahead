import { readdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

// Lets the preschool minigames' background music (use-background-music.ts)
// pick from whatever's in public/static/music without hardcoding filenames —
// drop a new .mp3 in that folder and it's in the rotation, no code change
// needed. Excluded from the locale/auth middleware by its "/api" matcher (see
// middleware.ts), so this is reachable without a session.
const MUSIC_DIR = path.join(process.cwd(), "public", "static", "music");

export async function GET() {
  const files = await readdir(MUSIC_DIR);
  const tracks = files
    .filter((file) => file.toLowerCase().endsWith(".mp3"))
    .map((file) => `/static/music/${file}`);
  return NextResponse.json({ tracks });
}
