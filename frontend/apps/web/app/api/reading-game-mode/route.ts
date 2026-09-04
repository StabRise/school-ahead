import { readdir } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

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
const VALID_CONSONANT = /^[А-ЩЬЮЯЄІЇҐа-щьюяєіїґ]{1,3}$/u;
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
  if (!consonant || !VALID_CONSONANT.test(consonant)) return NextResponse.json(EMPTY_RESPONSE);

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
  cards.sort((a, b) => a.key.localeCompare(b.key, "uk"));

  return NextResponse.json({ cards, syllableSounds });
}
