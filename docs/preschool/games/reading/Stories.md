# Reading Game — "Казки" (Stories)

The third game in the `docs/preschool/games/reading` series, alongside
"Склади" (Syllables, `packages/preschool-games/src/reading-game.tsx`) and
"Картки" (Cards, `Cards.md`, `packages/preschool-games/src/
cards-game.tsx`). The child reads a short story in which selected hard
words are broken into syllable cards — the same syllable cards they
already manipulate in the "Склади"/"Картки" games (vowel letter red,
consonant blue, as in `frontend/apps/web/public/static/syllables`).

## 1. Goal

Ukrainian language! Carry syllable-recognition skill (from "Склади"/
"Картки") into the context of connected text: the child sees a story, with
hard words shown broken into syllables so they can be read "piece by
piece." Purely a text/visual game — no read-aloud narration.

## 2. Content

Each story is its own folder, `frontend/apps/web/public/static/stories/
<story name>/`, containing:

- **`story.md`** — the story text, plain Markdown (headings, **bold**,
  *italic*, lists, blockquotes — all supported): the first line(s) are the
  title (`# 🐰 Story Title`, optionally with an extra line above it, e.g.
  `### author/source`, which becomes a subtitle); the rest is free-form
  Markdown.
- **any image files** alongside (e.g. `img1.jpeg`) — photographs of
  hand-drawn cards (same approach as `public/static/syllables`: draw on
  paper, photograph, see `backend/lessons/management/commands/
  slice_flashcard_grid.py`).
- **`cover.<png|jpg|jpeg|webp>`** — the book cover shown on the story
  picker (e.g. `frontend/apps/web/public/static/stories/Рукавичка/
  cover.png`). Optional — without one, the card shows 📖 instead of a
  cover.
- **`background.mp3`** — background music while reading this specific
  story. Optional — without one there's simply no toggle button (§4); like
  the cover, there's no server-side check for whether the file exists — a
  missing file just doesn't play.

The folder name is the story's name in the picker list (unless `story.md`
has its own `#` heading). A hard word in `story.md` can be shown two ways
(both via curly braces):

- **`{ві - н}`**, **`{К - ВІ - Т - КА}`** — syllables as text, hyphen
  separated (case and syllable count are free-form; a single syllable can
  also be a bare consonant with no vowel). Each syllable is drawn the same
  way as the cards in `frontend/apps/web/public/static/syllables/
  <Consonant>/<syllable>.png` — if that file exists (a two-letter
  consonant+vowel syllable), that exact picture is used; if not (a bare
  consonant), the syllable is just shown as colored letters.
- **`{ img1.jpeg }`** — an image filename from the same folder, in place of
  a syllable (or syllables). Can stand for a whole word on its own (`{
  img1.jpeg }` by itself) or as one syllable among others in a hyphenated
  list (`{К - img1.jpeg - Т - КА}`) — the only rule is the filename itself
  can't contain a hyphen when it's inside a hyphenated list (since a hyphen
  is the syllable separator); standing alone (the entire `{...}` content is
  just the filename), a hyphen in the filename is fine.
- **`{ koza.mp3 }`** — an audio filename from the same folder, in place of
  a whole word (only as its own standalone group, never mixed into a
  hyphenated syllable list) — a small speaker button plays this recording
  on tap, no fullscreen view.
- **`{ 1.avi }`** — a video filename from the same folder, in place of a
  whole word (same standalone-group rule), same approach as `{ img1.jpeg
  }` except it's a short looping video clip instead of a still image.

New stories are added with no code change — just drop a new folder with
`story.md` (and any needed images) into `frontend/apps/web/public/static/
stories/`.

## 3. Interface

**Screen 1 — story picker:** a row of books directly on the game
background (no extra frame around it — only one frame per screen, same
convention every game here uses) — each with a square cover
(`cover.<ext>`, or 📖 if none exists yet) and a title underneath; a book
noticeably enlarges on hover. Shared component:
`frontend/packages/preschool-games/src/story-book.tsx` (`StoryBook`) — the
same component used both here and in the post-lesson reward game picker
(`packages/preschool-games/src/game-choice.tsx`), since both places show
the same story-picker screen. Tapping a cover advances to screen 2.

**Screen 2 — the story "page":** a round icon button "📚" at the top (with
a "Back to book picker" tooltip) returns to screen 1, followed by the
story title and text. No overall text-to-speech narration — there's no
"read aloud" button or a "muted" mode; an individual `{...}` word can have
its own audio file (§2), which is always a deliberate choice by the
story's author, not automatic narration.

If the story's folder has a `background.mp3` (§2), a second round button
("🎵"/"🔇") appears next to "📚" — toggles that background music, looped;
for a story without that file, the button simply isn't there
(`packages/preschool-games/src/lib/use-story-background-music.ts`).

The game is public at `/games/stories[/<story>]` — reachable by a signed-out
visitor too (every game under `/games` is public, see `middleware.ts`'s
`PUBLIC_PATHS`; the "Вчуся Читати" ("Learning to Read") link in the site
header for a signed-out visitor leads exactly here, see
`components/header.tsx`). Each story has its own link
(`StoriesGamePage` takes a `basePath` — `packages/preschool-games/src/
stories-game.tsx`), so a specific story can be shared directly, signed in
or not.

## 4. Mechanics

Every `{...}` word except a standalone audio file (§2 — that's just a play
button, no popup) opens fullscreen on tap: a row of cards (from syllables,
an image file, or both) rendered 2.5× larger than in the text; a
standalone video file likewise opens fullscreen, with sound (unlike the
small in-text card, which the browser's autoplay policy always keeps
muted) and its own controls (pause/seek/volume). The popup closes by
tapping anywhere on it, the "✕" button, Esc, or Space.

The "📚" button and — for signed-in students — the star counter in the
top-right corner stay fixed in place even when the story text is scrolled
down (they sit outside the scroll area, `packages/preschool-games/src/
stories-game.tsx`'s `StoryPage`).

## 5. Reward

Signed-in students only — an anonymous visitor can browse stories and open
cards the same way, just with no account to award a Diamond to (there
isn't even a star counter for them). Each opened syllable/letter word-card
(§4) adds 1 star to the top-right counter ("⭐ N/5") — a bare image or
video with no syllables (`{ img1.jpeg }`, `{ 1.avi }`) doesn't count, since
it isn't a word to read. Every 5 stars awards 💎 1 Diamond, flying to the
site header (the same `@school-ahead/preschool-ui`'s `flying-diamond.tsx`
used by the Trains/Syllables games), via `POST /auth/me/stories-game-reward`
(`accounts.services.award_stories_game_diamond`) — implemented through the
shared `useDiamondMilestoneReward` (`packages/preschool-games/src/kit/`),
same as every other minigame. The counter is session-only (resets when
opening a different story or reloading the page), with no server-side
verification — the same client-trust approach as every other minigame, see
`docs/core/gamification.md`.
