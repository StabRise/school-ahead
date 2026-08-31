import { readdir, readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

// Drives balloon-pop-game.tsx's picture-pool modes (lib/preschool-sounds.ts)
// straight from the filesystem instead of a hardcoded name/image list — drop
// an image into public/preschool/<folder> and it's a card, no code change
// needed. A card's name is its filename (minus extension) verbatim, so an
// image must be named exactly like the card it should produce (e.g.
// "Bear.jpeg" -> card "Bear"); two names that share one picture need the
// image duplicated under both names (e.g. "Mother.jpeg" and "Mommy.jpeg").
//
// Per-language subfolders (public/preschool/<folder>/en, /uk, /pl) are
// optional opt-in metadata, not per-language image sets — the pictures
// themselves are shared across languages. A subfolder's presence marks that
// language as supported for the mode (see availableLanguages, used to hide
// the mode from the picker for languages without one), and its title.json's
// "title" field overrides the mode's display name for that language.
//
// Excluded from the locale/auth middleware by its "/api" matcher (see
// middleware.ts), so this is reachable without a session.
//
// `folder` is restricted to a bare alphanumeric-plus-hyphen segment — it's
// interpolated straight into a filesystem path below, and every asset folder
// name in the codebase (e.g. "animals", "body-parts") matches that shape, so
// anything else is rejected outright rather than risking path traversal.
const VALID_FOLDER = /^[a-zA-Z0-9-]+$/;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const LANGUAGES = ["en", "uk", "pl"];

export async function GET(request: NextRequest) {
  const folder = request.nextUrl.searchParams.get("folder");
  if (!folder || !VALID_FOLDER.test(folder)) {
    return NextResponse.json({ cards: [], availableLanguages: [], titles: {} });
  }

  const folderDir = path.join(process.cwd(), "public", "preschool", folder);
  const entries = await readdir(folderDir, { withFileTypes: true }).catch(() => []);

  const cards = entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => {
      const ext = path.extname(entry.name);
      return { name: entry.name.slice(0, -ext.length), image: `/preschool/${folder}/${entry.name}` };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const availableLanguages = entries
    .filter((entry) => entry.isDirectory() && LANGUAGES.includes(entry.name))
    .map((entry) => entry.name);

  const titles: Record<string, string> = {};
  await Promise.all(
    availableLanguages.map(async (language) => {
      const title = await readFile(path.join(folderDir, language, "title.json"), "utf-8")
        .then((raw) => (JSON.parse(raw) as { title?: string }).title)
        .catch(() => undefined);
      if (title) titles[language] = title;
    }),
  );

  return NextResponse.json({ cards, availableLanguages, titles });
}
