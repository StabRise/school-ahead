import { readdir } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getReading } from "@school-ahead/api-client/server/reading/reading";
import type { QuizLanguage } from "@school-ahead/api-client/server/schoolAheadAPI.schemas";
import { readingGameLanguage } from "@/lib/reading-game-language";

// Everything the reading minigame (components/preschool/reading-game.tsx)
// needs for one consonant level, read straight from its folder under
// public/static/letters/<consonant> — no hardcoded vocabulary anywhere
// in the app. Reachable without a session (excluded from the locale/auth
// middleware by its "/api" matcher, see middleware.ts).
//
// A consonant folder looks like:
//   <consonant>/<Word>.png     — a picture card, filename is the whole word
//   <consonant>/<Word>.mp3     — optional: a recorded pronunciation of that
//                                same word, matched by filename (case-
//                                insensitively, since the recording isn't
//                                always capitalized the same as its image)
//   <consonant>/<Syllable>.mp3 — optional: a recorded pronunciation of a
//                                bare two-letter syllable (e.g. "Ма.mp3"),
//                                distinguished from a word recording purely
//                                by being exactly two letters long
//
// A card's syllable is its word's first two letters, uppercased (Ukrainian
// consonant+vowel syllables, e.g. "Мед.png" -> "МЕ", "Миша.png" -> "МИ") —
// there's no separate syllable field to author, it's derived from the
// filename itself. Several words can (and are meant to) share a syllable
// (e.g. "Морква.png" and "Морозиво.png" both -> "МО") so a level can have
// more picture cards than distinct syllables, per docs/preschool/games/
// reading/README.md.
//
// `consonant` is restricted to a short run of Cyrillic letters — it's
// interpolated straight into a filesystem path below, and every level
// folder name in this app matches that shape, so anything else (path
// separators, "..", ...) is rejected outright.
//
// `?language=` (the game's language setting, Ukrainian by default) also
// pulls that language's reading.Syllable cards from the DB (Django's
// public GET /api/reading/syllables — what the tutor /tutor/syllables ZIP
// import fills), with its word_audio/syllable_audio as the recordings. The
// static folders are all Ukrainian, so they're only read for "uk", and a
// DB card replaces a folder card for the same word.
const VALID_CONSONANT = /^[А-ЩЬЮЯЄІЇҐа-щьюяєіїґ]{1,3}$/u;
// A DB level's consonant never reaches the filesystem, so any letters do
// (Latin ones for the English/Polish/Spanish cards).
const VALID_DB_CONSONANT = /^\p{L}{1,3}$/u;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const AUDIO_EXTENSIONS = new Set([".mp3"]);
const LETTERS_DIR = path.join(process.cwd(), "public", "static", "letters");

export interface ReadingGameCard {
  key: string; // the word, e.g. "Мед" — also its image's filename minus extension
  image: string;
  syllable: string; // e.g. "МЕ"
  // A recorded pronunciation of the word, if <Word>.mp3 exists alongside
  // the image — see lib/reading-game.ts's playCardSound, which prefers this
  // over TTS whenever it's present.
  sound: string | null;
}

export interface ReadingGameModeResponse {
  cards: ReadingGameCard[];
  // Recorded pronunciation of a bare syllable (e.g. "МА" -> ".../Ма.mp3"),
  // keyed by the same uppercased syllable string a card's `syllable` field
  // uses — components/preschool/reading-game.tsx prefers this over TTS the
  // same way card.sound is preferred for a word.
  syllableSounds: Record<string, string>;
}

const EMPTY_RESPONSE: ReadingGameModeResponse = { cards: [], syllableSounds: {} };

function syllableOf(word: string): string {
  return word.slice(0, 2).toLocaleUpperCase("uk");
}

export async function GET(request: NextRequest) {
  const consonant = request.nextUrl.searchParams.get("folder");
  if (!consonant || !VALID_DB_CONSONANT.test(consonant)) return NextResponse.json(EMPTY_RESPONSE);
  const language = readingGameLanguage(request);

  const [folderLevel, dbLevel] = await Promise.all([
    language === "uk" && VALID_CONSONANT.test(consonant) ? folderLevelData(consonant) : Promise.resolve(EMPTY_RESPONSE),
    dbLevelData(consonant, language),
  ]);

  // A DB card replaces the folder card for the same word, keeping the
  // folder's recording when the DB row has none of its own.
  const folderByWord = new Map(folderLevel.cards.map((card) => [card.key.toLocaleLowerCase(language), card]));
  const dbCards = dbLevel.cards.map((card) => ({
    ...card,
    sound: card.sound ?? folderByWord.get(card.key.toLocaleLowerCase(language))?.sound ?? null,
  }));
  const dbWords = new Set(dbCards.map((card) => card.key.toLocaleLowerCase(language)));
  const cards = [
    ...folderLevel.cards.filter((card) => !dbWords.has(card.key.toLocaleLowerCase(language))),
    ...dbCards,
  ].sort((a, b) => a.key.localeCompare(b.key, language));

  return NextResponse.json({
    cards,
    syllableSounds: { ...folderLevel.syllableSounds, ...dbLevel.syllableSounds },
  } satisfies ReadingGameModeResponse);
}

async function dbLevelData(consonant: string, language: QuizLanguage): Promise<ReadingGameModeResponse> {
  const rows = await getReading()
    .listReadingSyllables({ consonant, language })
    .catch(() => []);
  const cards: ReadingGameCard[] = [];
  const syllableSounds: Record<string, string> = {};
  for (const row of rows) {
    // Nothing to show without a picture — same skip as the Cards game.
    if (!row.icon) continue;
    const syllable = `${row.first_letter}${row.second_part}`.toLocaleUpperCase(language);
    cards.push({ key: row.word, image: row.icon, syllable, sound: row.word_audio });
    if (row.syllable_audio) syllableSounds[syllable] = row.syllable_audio;
  }
  return { cards, syllableSounds };
}

async function folderLevelData(consonant: string): Promise<ReadingGameModeResponse> {
  const folderDir = path.join(LETTERS_DIR, consonant);
  const entries = await readdir(folderDir, { withFileTypes: true }).catch(() => []);

  const images: { word: string; file: string }[] = [];
  const soundsByLowerWord = new Map<string, string>();
  const syllableSounds: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name);
    const word = entry.name.slice(0, -ext.length);
    if (IMAGE_EXTENSIONS.has(ext.toLowerCase())) {
      images.push({ word, file: entry.name });
    } else if (AUDIO_EXTENSIONS.has(ext.toLowerCase())) {
      soundsByLowerWord.set(word.toLocaleLowerCase("uk"), entry.name);
      if (word.length === 2) {
        syllableSounds[word.toLocaleUpperCase("uk")] = `/static/letters/${consonant}/${entry.name}`;
      }
    }
  }

  const cards: ReadingGameCard[] = [];
  for (const { word, file } of images) {
    if (word.length < 2) continue;
    const soundFile = soundsByLowerWord.get(word.toLocaleLowerCase("uk"));
    cards.push({
      key: word,
      image: `/static/letters/${consonant}/${file}`,
      syllable: syllableOf(word),
      sound: soundFile ? `/static/letters/${consonant}/${soundFile}` : null,
    });
  }
  return { cards, syllableSounds };
}
