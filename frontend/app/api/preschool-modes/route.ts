import { readdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

// The balloon-pop minigame's mode list (components/preschool/
// balloon-pop-game.tsx) is just whatever subfolders exist here — drop a new
// folder into public/preschool/baloon-game (with images and/or a language
// subfolder's sounds, see /api/preschool-mode) and it's a selectable mode,
// no code change needed. Excluded from the locale/auth middleware by its
// "/api" matcher (see middleware.ts), so this is reachable without a
// session.
const BALOON_GAME_DIR = path.join(process.cwd(), "public", "preschool", "baloon-game");

export async function GET() {
  const entries = await readdir(BALOON_GAME_DIR, { withFileTypes: true }).catch(() => []);
  const modes = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
  return NextResponse.json({ modes });
}
