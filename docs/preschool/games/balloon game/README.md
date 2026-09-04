# Balloon Pop Game

One of the five "celebration minigame" choices offered on `/` once every
lesson for the day (and every backlog tail) is cleared — see
`docs/views/preschool/README.md` §2 for how it's triggered and picked. This
doc covers the game itself in depth: its content model (the piece meant to
be edited without touching code), and the frontend architecture that reads it.

Component: `frontend/packages/preschool-games/src/balloon-pop-game.tsx` →
`BalloonPopGame`. Balloons spawn on an interval, drift down the screen, and
pop on tap with a particle burst and a procedural Web Audio "pop" (no audio
asset pipeline exists for sound effects — only for real recorded words, see
below). A ruby-icon counter (`score`) tracks rubies earned this session —
popping a balloon (below) and, on the "learning" screen, tapping any card
(§4, repeats included) both add one — and every 30 rubies, flies a 💎 to
the header and calls `POST /auth/me/balloon-pop-reward`. See
`docs/core/gamification.md` for how this fits into the rest of the diamond
economy (lesson/topic/semester bonuses, the avatar shop, ...).

## 1. The content model — `public/static/balloon-game/`

**This is the part meant to be edited without touching any code.** The
game's entire mode list, vocabulary, images, recordings, and text come from
this one folder tree:

```
public/static/balloon-game/
  <mode>/                       — one folder per mode; the folder name IS the mode
    <Card>.jpeg                 — an image, shared across every language
    <Card2>.png
    <en|uk|pl>/
      sounds/
        <Card>.mp3              — that language's recording of <Card>
      title.json                — { "title", "quiz", "cards" } — see below
```

**A mode is just a folder.** `GET /api/preschool-modes`
(`frontend/app/api/preschool-modes/route.ts`) lists the subfolders of
`baloon-game/` and that list *is* the mode picker — there's no hardcoded
mode registry anywhere in the app. Drop in a new folder with at least one
image or one language's `sounds/` folder, and it's a selectable mode with no
code change. `BalloonMode` (`frontend/packages/preschool-games/src/stores/balloon-pop-game-store.ts`) is
just `string` for this reason — it used to be a fixed literal union before
this became folder-driven.

**A card's canonical key** is whatever an image file *or any language's*
sound file is named, minus its extension — the union across every source.
This is why the card list itself never changes when you switch the game
language: switching only changes which cards have a *recording*, and what
text represents them (see `title.json`'s `"cards"` map, below). An image
file's name must match its card's key exactly (case matters); two cards
that share one picture need the image duplicated under both names (e.g.
`family/Mother.jpeg` and `family/Mommy.jpeg` are the same photo, copied
twice) — there's no aliasing mechanism.

If a card has an image, the balloon hangs it below on a string and the
"learning" screen (§4) shows it as a photo. If not (every number mode, so
far), the card just prints as text — big, on the balloon itself, and as a
large number filling the card in the learning grid.

### `title.json`

Optional, one per language subfolder. All three fields are optional:

```json
{
  "title": "Numbers 0-10",
  "quiz": { "question_format": "Where is the number {card}?" },
  "cards": { "Backpack": "Plecak", "Book": "Książka" }
}
```

* **`title`** — overrides the mode's display name in the mode picker for
  that language. Falls back to the mode's English title, then to a
  prettified folder name (`school-supplies` → `School Supplies`), if
  missing — see `prettifyModeName`/`modeLabel` in `balloon-pop-game.tsx`.
* **`quiz.question_format`** — overrides the bonus-quiz phrasing (§5) for
  that language. `{card}` is replaced with the card's display name (its
  translation if it has one, otherwise its key). Falls back to
  `DEFAULT_QUESTION_FORMAT` (`"Where is {card}?"` / `"Де {card}?"` /
  `"Gdzie jest {card}?"`) if missing.
* **`cards`** — a canonical-key → translated-text map, used only when *this
  language has no recording* for that specific card (see §3). It's what
  makes a card display and speak the right word via TTS instead of the
  English filename — e.g. `school-supplies/pl/title.json` has no `pl/sounds`
  at all, so its `"cards"` map is the only reason a Polish-speaking child
  sees/hears "Plecak" rather than "Backpack".

### Per-language availability

A mode with **no** `en`/`uk`/`pl` subfolders at all hasn't opted into
per-language gating and stays available for every game language. A mode
with at least one language subfolder is only offered for the languages it
actually has a subfolder for (`isModeAvailableForLanguage` in
`balloon-pop-game.tsx`) — the subfolder just needs to *exist*; it can hold
only a `title.json` with no `sounds/` at all (that's exactly how
`numbers-0-10`/`numbers-11-20`/`numbers-10-100` support uk/pl today: a
localized title and quiz phrasing, TTS-only audio).

If the currently-selected mode becomes unavailable after a language switch,
the game silently falls back to the first available mode rather than
showing a broken/empty one.

### `colors` is the one special case

Every other mode picks a random palette hex for its balloon's fill. `colors`
is the sole exception (`mode === "colors"` in `generateBalloonContent`): its
balloon is filled with the card's own **key**, lowercased, as a literal CSS
color (`Red.jpeg` → `fill: "red"`) — the balloon *is* the color a child is
learning, with the photo hanging below as a real-world anchor. This is why
the mode's images must be named after actual CSS color keywords. A
throwaway-canvas luminance check (`labelTextColorFor`) picks black or white
label text so pale colors ("White", "Yellow", "Beige", ...) stay legible —
every other mode keeps plain white text.

### Adding a new mode — checklist

1. `mkdir public/static/balloon-game/<new-mode>`.
2. Drop in images and/or `<language>/sounds/*.mp3` files, named to match.
3. Optionally add `<language>/title.json` for a proper display name, quiz
   phrasing, and/or translated card text.
4. That's it — no code change, no restart needed beyond the dev server
   already running (the API reads the filesystem live on every request).

## 2. API surface

Two routes, both excluded from the locale/auth middleware (`/api` matcher
in `middleware.ts`) so they're reachable without a session:

* **`GET /api/preschool-modes`** — `{ modes: string[] }`, the sorted list of
  `baloon-game/` subfolder names.
* **`GET /api/preschool-mode?folder=<mode>`** — everything for one mode, for
  every language at once (so a language switch never needs a new request):
  ```ts
  {
    cards: { key: string; image?: string }[],
    availableLanguages: string[],
    titles: Record<string, string>,
    quizFormats: Record<string, string>,
    translations: Record<string, Record<string, string>>,
    sounds: Record<string, { names: string[]; soundsPath: string | null }>,
  }
  ```
  `folder` is restricted to `/^[a-zA-Z0-9-]+$/` before it's interpolated
  into a filesystem path, since every real mode folder name matches that
  shape and it rules out path traversal outright.

`frontend/packages/preschool-games/src/lib/preschool-sounds.ts` wraps both behind two hooks —
`usePreschoolModes()` and `usePreschoolModeData(folders)` — each with a
module-level cache so every mounted game/settings-panel instance shares one
fetch per mode instead of re-requesting.

## 3. Card resolution and playback

For the currently selected mode + language, `BalloonPopGame` resolves:

* **`selectedCards`** — a `cardCount`-sized (slider in settings, 4–20,
  default 6) shuffled, deduped-by-key subset of the mode's full card list.
  Re-picked only when the mode, `cardCount`, or the underlying data
  changes, so toggling between the "game" and "learning" screens never
  reshuffles it mid-session.
* **`displayCards`** — `selectedCards` resolved to actual display text via
  `resolveCardName(card, language, modeData)`: the `title.json` translation
  for that card if one exists, else the canonical key. This is what's
  printed on balloons, shown in the learning grid, and used as quiz choices.

**Playback** (`playCard` in `balloon-pop-game.tsx`): if the current
language's `sounds.names` includes the card's canonical key, play the
recording (`playRecordedSound`); otherwise fall back to Piper TTS
(`lib/piper-tts.ts`) speaking the card's *display* name (translated if
available) in that language's voice. The distinction between "canonical
key" and "display name" matters here specifically — a recording is always
looked up by key (matches the `.mp3` filename), never by the possibly
different translated text.

An unrelated effect proactively warms the TTS cache
(`prefetchVoice`/`warmupSpeech`) for every card the mode *can* speak that
isn't already covered by a recording — not just the currently-displayed
subset, so a later reshuffle never pays live synthesis latency either.

## 4. "Learning" screen

`frontend/packages/preschool-games/src/balloon-learning-cards.tsx` →
`BalloonLearningCards`. A static grid replacing the falling balloons,
toggled via the bottom-right Game/Learning pill (shown whenever the mode has
at least one card) — lets a child tap each item at their own pace and hear
it as many times as they like, using the exact same `displayCards` subset
the "game" screen draws from. Tapping calls the same `playCard` playback
logic as popping a balloon.

Every tap also awards a ruby via the same `onCardLearned` →
`handleCardLearned` path `handlePop` uses (§ above) — repeat taps on the
same card included, same as re-popping balloons of the same card in the
"game" screen.

## 5. Bonus quiz

`frontend/packages/preschool-games/src/balloon-quiz.tsx` → `BalloonQuiz`, opened by
tapping a heart-shaped "?" balloon (spawns randomly, ~10% chance per tick,
at most one on screen at a time, checked in the same spawn interval as
regular balloons). Every mode uses the same mechanic — no more per-mode
quiz kinds:

* 6 questions, each phrased via that mode's resolved `quizQuestionFormat`
  (§1) with `{card}` filled in.
* 4 choices (1 target + up to 3 distractors from the mode's own
  `displayCards` pool), rendered as images if the target has one, else as
  big text — same visual language as the learning cards.
* Passing (`> 60%`, strictly) plays a star-burst celebration, awards 1
  Diamond via `POST /auth/me/balloon-quiz-reward`, and flies a 💎 to the
  header — same reward animation as the pop-count milestone.

## 6. Persisted settings

`frontend/packages/preschool-games/src/stores/balloon-pop-game-store.ts` (`useBalloonPopGameStore`,
`localStorage`-persisted): `mode`, `language` (`en`/`uk`/`pl`, shared with
the Letter Train minigame's TTS language), `size`/`speed`/`maxOnScreen`
(balloon sizing/fall speed/how many on screen), `muted`, `screenMode`
(`"game" | "learning"`), `cardCount`. A `mode` value persisted from before
this became folder-driven (e.g. an old `"numbers10"`/`"letters"`) self-heals
once the real mode list loads and the persisted value doesn't match any of
it — no migration needed.

## 7. Current modes (as of writing)

Alphabetical — the picker has no manual ordering, it's just whatever
`readdir` returns, sorted:

| Folder | Cards | Images | Per-language | Notes |
|---|---|---|---|---|
| `animals` | 20 | ✅ | en only | |
| `body-parts` | 13 | ✅ | en only | |
| `colors` | 19 | ✅ | en only | balloon fill = the card's own color |
| `family` | 11 | ✅ | en only | 4 duplicated images (Mother/Mommy, etc.) |
| `fruits` | 17 | ✅ | en only | |
| `greetings` | 8 | ✅ | en only | multi-word phrases |
| `numbers-0-10` | 11 | — | en/uk/pl | custom quiz phrasing; uk/pl are TTS-only |
| `numbers-11-20` | 10 | — | en/uk/pl | uk/pl are TTS-only |
| `numbers-10-100` | 10 | — | en/uk/pl | counts by tens (10, 20, …, 100); uk/pl are TTS-only |
| `school-supplies` | 13 | ✅ | en/pl | `pl` has translated card text, no recordings |

## 8. Known gaps

* Only `numbers-*` and `school-supplies` have opted into more than English
  so far — everything else is English-only until someone adds `uk`/`pl`
  subfolders (translated `title.json` `"cards"` text is enough on its own;
  real recordings are a nice-to-have on top).
* Mode ordering is purely alphabetical — there's no way to curate a
  pedagogical order without renaming folders.
* No admin UI for any of this yet — editing means touching files under
  `public/static/balloon-game/` directly.
