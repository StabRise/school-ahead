# Reading Game — "Картки" (Cards)

The second game in the `docs/preschool/games/reading` series, alongside
"Склади" (Syllables, `README.md`, `packages/preschool-games/src/
reading-game.tsx`) and "Казки" (Stories, `Stories.md`, `packages/
preschool-games/src/stories-game.tsx`). Component:
`frontend/packages/preschool-games/src/cards-game.tsx` → `CardsGame`.
Unlike "Склади" (drag-and-drop), each card here is already a finished
image (syllable + object picture baked into one file), so the game is
"listen and recognize," not "drag."

## 1. Goal

Ukrainian language! Reinforce syllable (consonant + vowel) recognition
through repeated listening to a card ("Навчання"/Learning mode) and testing
recognition by ear among several options ("Гра"/Game mode).

## 2. Content

Cards live at `frontend/apps/web/public/static/syllables/<Consonant>/
<syllable>.png` — each file already contains both the syllable's written
form (vowel letter red, consonant blue) and a picture of an object starting
with that syllable (e.g. `ba.png` → БА + a little ram/lamb). Drawn and
photographed the same way as described in `docs/preschool/games/reading/
Stories.md` §3 (see `backend/lessons/management/commands/
slice_flashcard_grid.py`). A `words.json` sits alongside, mapping
`"syllable": "object name"` (e.g. `"ба": "баран"`). A consonant is only
available as a level (`GET /api/cards-game-modes`) if its folder has a
`words.json` — freshly sliced sheets with no `words.json` yet
(`row0_colN.png`) aren't ready and don't show up in the game.

## 3. Interface

Settings button (⚙️, top-left):

- consonant picker (only consonants that have a `words.json`);
- label cards with the object's name: on/off;
- mute: on/off.

A "Гра"/"Навчання" (Game/Learning) toggle — a round pill switch bottom-right
(same pattern as `balloon-pop-game.tsx`) — only shows once the selected
consonant actually has cards.

## 4. Learning mode (`CardsLevel`)

A grid of the selected consonant's cards (six cards — vowels А О У Е И І),
the same `BalloonLearningCards` component used on the Balloon Pop game's
own "learning" screen (`packages/preschool-games/src/
balloon-learning-cards.tsx`). Tapping a card plays the syllable, then the
pictured object's name; tapping again just repeats the sound. Once the
child has touched every card for that consonant at least once, a
celebration animation (🎉) shows with "Again" and "Next: <next consonant>"
buttons.

## 5. Game mode / "knowledge check" (`CardsFallingGame`)

The consonant's cards fall continuously from top to bottom (the same
falling motion as the balloons in `balloon-pop-game.tsx` — spawn on an
interval, up to 10 cards on screen at once, 8–13 seconds to fall). A target
syllable shows at the top (in the same colored-letter style as "Склади")
with a "🔊" button to repeat it; it's also spoken aloud immediately once a
target is chosen. The child taps a falling card:

- **matches the target syllable** — a pleasant sound, star particles burst
  from the tap point, the score in the top-right corner increases, and a
  new target syllable is chosen;
- **doesn't match** — a soft "wrong" sound, the card just disappears, no
  penalty;
- **reaches the bottom unnoticed** — also just disappears, no penalty.

Score and target are session-only (reset on changing consonant or
re-entering the screen) — no server-side answer verification.

Every 10 stars (`DIAMOND_MILESTONE_STARS`) award 1 Diamond via `POST
/auth/me/cards-game-reward` — the same "count" pattern as the Trains,
Balloon Pop, and Stories games (`docs/core/gamification.md`), unlike
"Склади," where the Diamond is awarded on level completion. Logged-in
students only — an anonymous visitor (every game is public under `/games`,
see `middleware.ts`) still watches their score climb, they just don't earn
a Diamond for it (see `useDiamondMilestoneReward` in
`frontend/packages/preschool-games/src/kit/`).
