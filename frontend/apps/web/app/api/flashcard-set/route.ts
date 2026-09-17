import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { isFlashcardLanguage, isValidFlashcardSlug, type FlashcardLanguage, type FlashcardSet } from "@school-ahead/flashcards/types";

// Raw content of one set.json (docs/preschool/games/cards.md) — the direct
// link a lesson embeds (games/cards/<group>/<set>) reads this on load.
// Also returns the group's own title.json title, so the game page can show
// a "Matematyka / Matematyka 7 klasa" breadcrumb without a second fetch.
// Any image a card references (by relative path, e.g. "img/potęga.jpeg")
// lives right next to set.json under public/static/cards/<group>/<set>/ and
// is served as a plain static file — see lib/flashcards.ts's
// flashcardImageUrl. Excluded from the locale/auth middleware by its "/api"
// matcher (see middleware.ts), reachable without a session.
//
// `group`/`set` are bare folder names interpolated straight into a
// filesystem path below — rejected outright if either could escape
// CARDS_DIR (path separators, "..", a leading "."), same rule
// app/api/story/route.ts applies to its own `slug`.
const CARDS_DIR = path.join(process.cwd(), "public", "static", "cards");
const TITLE_FILE = "title.json";
const SET_FILE = "set.json";

interface GroupMeta {
  title: string | null;
  // The group's default TTS language (title.json's optional `language`,
  // e.g. fizyka/title.json: {"language": "pl"}) — see FlashcardLanguage.
  language: FlashcardLanguage | null;
}

async function readGroupMeta(groupDir: string): Promise<GroupMeta> {
  const content = await readFile(path.join(groupDir, TITLE_FILE), "utf-8").catch(() => null);
  if (content === null) return { title: null, language: null };
  try {
    const parsed = JSON.parse(content) as { title?: unknown; language?: unknown };
    const title = typeof parsed.title === "string" && parsed.title.length > 0 ? parsed.title : null;
    const language = isFlashcardLanguage(parsed.language) ? parsed.language : null;
    return { title, language };
  } catch {
    return { title: null, language: null };
  }
}

// The client uses `id` to tell cards apart (quiz distractor exclusion, the
// correct-answer check, React keys) — renumbered sequentially here rather
// than trusted from set.json, since the doc's own sample content doesn't
// always include one (and nothing else needs the author's original id to
// be stable across edits).
function assignSequentialIds(set: FlashcardSet): void {
  let nextId = 1;
  for (const category of set.categories) {
    for (const item of category.items) {
      item.id = nextId++;
    }
  }
}

async function readSet(setDir: string): Promise<FlashcardSet | null> {
  const content = await readFile(path.join(setDir, SET_FILE), "utf-8").catch(() => null);
  if (content === null) return null;
  try {
    const parsed = JSON.parse(content) as { set?: FlashcardSet };
    const set = parsed.set;
    if (!set || typeof set.title !== "string" || !Array.isArray(set.categories)) return null;
    assignSequentialIds(set);
    return set;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const group = request.nextUrl.searchParams.get("group");
  const set = request.nextUrl.searchParams.get("set");
  if (!group || !set || !isValidFlashcardSlug(group) || !isValidFlashcardSlug(set)) {
    return NextResponse.json({ groupTitle: null, groupLanguage: null, set: null });
  }

  const groupDir = path.join(CARDS_DIR, group);
  const [groupMeta, parsedSet] = await Promise.all([readGroupMeta(groupDir), readSet(path.join(groupDir, set))]);

  return NextResponse.json({ groupTitle: groupMeta.title, groupLanguage: groupMeta.language, set: parsedSet });
}
