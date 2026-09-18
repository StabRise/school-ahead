# Reading Game — "Склади" (Syllables)

The first game in the `docs/preschool/games/reading` series, alongside
"Картки" (Cards, see `Cards.md`) and "Казки" (Stories, see `Stories.md`).
Component: `frontend/packages/preschool-games/src/reading-game.tsx` →
`ReadingGame`, pure logic in `lib/reading-game.ts`.

## 1. Concept

An interactive web game for preschoolers, built on a tap/drag mechanic —
bright and appealing by design. Reinforces Ukrainian first-sound
recognition and teaches matching picture-words to their basic
consonant+vowel syllable (e.g. МА, МО, МУ, МЕ). Vowel letters are always
rendered red, consonants always blue — a convention shared with the Cards
and Stories games' syllable-card rendering.

## 2. Content

Picture cards load automatically from `frontend/apps/web/public/static/
letters/<Consonant>/` — each image's filename is the word itself (e.g. Мак,
Муха, Мороз, Мед, Морозиво for consonant `М`). There can be more picture
cards than syllable slots. No hardcoded vocabulary — adding a word is a
filesystem change (drop an image in the right consonant folder), same
folder-driven convention the Cards and Stories games use.

## 3. Interface

The play area splits into two zones:

- **Top row:** syllable cards for the active consonant (e.g. МА, МО, МУ,
  МЕ).
- **Bottom:** movable picture cards with captions, loaded from the
  consonant's folder. Slot/card size scales with how many syllables are on
  screen (`MIN_SLOT_REM`/`MAX_SLOT_REM` in `reading-game.tsx`) — fewer
  syllables render bigger, easier to grab; more shrink to still fit.

## 4. Mechanics

1. The child picks up a picture card (e.g. МЕД) and drags/taps it onto a
   syllable.
2. **Match:** if the card's word starts with that syllable (first two
   letters), it snaps into place, a bell chime plays, and TTS speaks the
   full syllable-then-word ("Ма — мед!"). Only the first two letters of the
   word need to match the syllable.
3. **No match:** the card smoothly returns to its starting position with a
   light hint sound.
4. **Level complete:** once every card has been matched, a bright
   celebration animation plays and the game offers to move on to the next
   consonant.

## 5. Reward

A diamond is added to the student's `accounts.StudentProfile.
diamond_balance_cache` on level completion, via `POST
/api/auth/me/reading-game-reward` (`accounts.services.
award_reading_game_diamond`) — flies to the header's diamond badge, same
`useDiamondMilestoneReward` (`mode: "level"`) pattern the other minigames
use.

## 6. Settings (`stores/reading-game-store.ts`, persisted to `localStorage`)

- **Syllable count** — `3`–`9` (`MIN_SYLLABLE_COUNT`/`MAX_SYLLABLE_COUNT`),
  default `4`. Vowels are added in a fixed order: А О У Е И І Я Ю Є.
- **Consonant** — default `М`; the picker list is alphabetically ordered
  and limited to consonants that actually have a folder under
  `public/static/letters/`.
- **Show captions** — whether picture cards display their word caption
  (default on).
- **Uppercase** — write syllables/captions in uppercase vs. lowercase
  (default uppercase).
- **Muted** — silences the spoken syllable/word; success/error chimes still
  play regardless.

Background music plays from `public/static/music/` (a random file, with a
new random pick when one finishes), toggleable independently — see the
shared `useBackgroundMusic`/`MusicToggleButton` convention the rest of this
game package uses.
