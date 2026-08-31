import { readdir, readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

// Everything the balloon-pop minigame (lib/preschool-sounds.ts) needs to run
// one mode, read straight from its folder under public/preschool/
// balloon-game/<folder> — no hardcoded per-mode data in the app at all.
// Reachable without a session (excluded from the locale/auth middleware by
// its "/api" matcher, see middleware.ts).
//
// A mode folder looks like:
//   <folder>/<Card>.jpeg              — an image, shared across languages
//   <folder>/<en|uk|pl>/sounds/<Card>.mp3   — that language's recording
//   <folder>/<en|uk|pl>/title.json          — { "title", "quiz", "cards" }
//
// `title.json`:
//   "title" overrides the mode's display name for that language.
//   "quiz.question_format" overrides the default "Where is {card}?" bonus-
//     quiz phrasing for that language — "{card}" is replaced with the
//     card's (possibly translated, see below) display name.
//   "cards" is an optional canonical-name -> translated-name map, for a
//     language with no recordings of its own: e.g. school-supplies/pl has
//     no sounds, so its title.json's "cards" gives the Polish word for
//     each card so TTS speaks (and the balloon shows) the right text
//     instead of the English filename.
//
// A card's canonical key is whatever an image or ANY language's sound file
// is named (minus extension) — the union across every source, so the card
// list itself never changes with the selected language, only which of them
// have a recording, and what text represents them, for that language.
//
// `folder` is restricted to a bare alphanumeric-plus-hyphen segment — it's
// interpolated straight into a filesystem path below, and every mode folder
// name in this app matches that shape, so anything else is rejected
// outright rather than risking path traversal.
const VALID_FOLDER = /^[a-zA-Z0-9-]+$/;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const LANGUAGES = ["en", "uk", "pl"];
const BALOON_GAME_DIR = path.join(process.cwd(), "public", "static", "balloon-game");

interface TitleJson {
  title?: string;
  quiz?: { question_format?: string };
  cards?: Record<string, string>;
}

async function listMp3Keys(dir: string): Promise<string[] | null> {
  return readdir(dir)
    .then((files) => files.filter((file) => file.toLowerCase().endsWith(".mp3")).map((file) => file.slice(0, -4)))
    .catch(() => null);
}

const EMPTY_RESPONSE = {
  cards: [] as { key: string; image?: string }[],
  availableLanguages: [] as string[],
  titles: {} as Record<string, string>,
  quizFormats: {} as Record<string, string>,
  translations: {} as Record<string, Record<string, string>>,
  sounds: {} as Record<string, { names: string[]; soundsPath: string | null }>,
};

export async function GET(request: NextRequest) {
  const folder = request.nextUrl.searchParams.get("folder");
  if (!folder || !VALID_FOLDER.test(folder)) return NextResponse.json(EMPTY_RESPONSE);

  const folderDir = path.join(BALOON_GAME_DIR, folder);
  const entries = await readdir(folderDir, { withFileTypes: true }).catch(() => []);

  const images: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name);
    if (!IMAGE_EXTENSIONS.has(ext.toLowerCase())) continue;
    images[entry.name.slice(0, -ext.length)] = `/static/balloon-game/${folder}/${entry.name}`;
  }

  const availableLanguages = entries
    .filter((entry) => entry.isDirectory() && LANGUAGES.includes(entry.name))
    .map((entry) => entry.name);

  const titles: Record<string, string> = {};
  const quizFormats: Record<string, string> = {};
  const translations: Record<string, Record<string, string>> = {};
  const sounds: Record<string, { names: string[]; soundsPath: string | null }> = {};
  const allSoundKeys = new Set<string>();

  await Promise.all(
    availableLanguages.map(async (language) => {
      const langDir = path.join(folderDir, language);

      const titleJson = await readFile(path.join(langDir, "title.json"), "utf-8")
        .then((raw) => JSON.parse(raw) as TitleJson)
        .catch(() => undefined);
      if (titleJson?.title) titles[language] = titleJson.title;
      if (titleJson?.quiz?.question_format) quizFormats[language] = titleJson.quiz.question_format;
      if (titleJson?.cards) translations[language] = titleJson.cards;

      const soundNames = await listMp3Keys(path.join(langDir, "sounds"));
      if (soundNames) {
        soundNames.forEach((name) => allSoundKeys.add(name));
        sounds[language] = { names: soundNames, soundsPath: `/static/balloon-game/${folder}/${language}/sounds` };
      } else {
        sounds[language] = { names: [], soundsPath: null };
      }
    }),
  );

  const cardKeys = new Set<string>([...Object.keys(images), ...allSoundKeys]);
  const cards = Array.from(cardKeys)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => (images[key] ? { key, image: images[key] } : { key }));

  return NextResponse.json({ cards, availableLanguages, titles, quizFormats, translations, sounds });
}
