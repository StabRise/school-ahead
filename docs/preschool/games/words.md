# Words Game — "Слова"

`/games/words` — `frontend/packages/preschool-games/src/words-game.tsx`.
Listed on the `/games` picker under «Читання» (seeded by
`backend/preschool/migrations/0012_seed_words_game.py`).

## 1. Concept

A calm flip-through of syllable cards for a child reading aloud with a
grown-up. No timer, no failing — the grown-up judges each card.

## 2. Content

Every `reading.Syllable` card (the same cards as «Склади» / «Картки», filled
by the tutor `/tutor/syllables` ZIP import) for the chosen **language** and
**letter**, read straight from the public `GET /api/reading/consonants` and
`GET /api/reading/syllables` endpoints. Cards without a picture are skipped.
Order: by vowel (МА, МО, МУ, … — same as «Склади»), then by word.

## 3. Screen

- **Syllable** — big, consonant blue / vowel red. Tap: its recording
  (`syllable_audio`), else TTS in the chosen language.
- **Picture** — the card's `icon`. Tap: the word's recording
  (`word_audio`), else TTS.
- **Word** — split into syllable cards like the «Казки» stories write them
  (`{ ма - ма }`, `{ во - в - к }`; see `lib/words-game.ts`'s
  `splitIntoReadingSegments`, the stories skill's splitting algorithm),
  rendered with the stories' `WordCardRow`. Tap: reads the word (like the
  picture) and opens the row full-screen, the same popup as a tapped «Казки»
  story card (`kit/fullscreen-overlay.tsx`); tap anywhere, ✕, Esc or Space
  closes it.
- **◀ / ▶** on the sides — previous / next card (wraps around).
- **✅ / ❌** bottom center — ✅ plays the success chime and moves on; ❌ plays
  the miss sound and reads the syllable, then the word, aloud.
- **Counter** top-right — cards looked at this visit (every card shown,
  across letters).

## 4. Reward

Every 30 cards looked at → 1 Diamond (`POST /api/auth/me/words-game-reward`,
`accounts.services.award_words_game_diamond`; same frontend-trusted model as
the other games, see [gamification](../../core/gamification.md)). Signed-out
visitors hear the celebration chime but earn nothing.

## 5. Settings (⚙️, `stores/words-game-store.ts`, persisted)

- **Language** — `uk` (default), `en`, `pl`, `es`.
- **Letter** — the letters that language has cards for; a remembered letter
  the language doesn't have falls back to its first one.
- **Показувати** — a checkbox per part (syllable / picture / word) to hide
  it. For a language with a handwriting font (`uk` — Propysy, `pl` —
  Elementarz) each text part also picks its own style:
  - **Склад** — «Друковані» (print, colored letters) or «Прописні»
    (handwriting).
  - **Слово** — «Картки» (the syllable cards above) or «Прописні» (the
    word written out in handwriting, one color so the letters stay joined;
    the tap popup shows it the same way, bigger).
- **Muted** — no syllable/word voice (chimes still play).
