# Cards — study flashcards

## 1. Overview

"Cards" is a study flashcards game for older students (grades 7-8), distinct
from the unrelated preschool syllable-reading minigame that also happens to
be called "Cards" internally (`@school-ahead/preschool-games`'s `CardsGame`,
routed at `/games/reading-cards`). This game targets real school subjects
(math, Polish, etc.): a card carries a term, its translation, an optional
illustration, and a short definition — plain vocabulary/concept drilling,
not a reading-readiness exercise. The interface is deliberately adult and
minimalist (slate palette, no gradients, no mascots, no bounce animations,
no diamond/gamification rewards) — nothing about it should read as
"childish".

Implementation lives in its own workspace package,
`frontend/packages/flashcards` (`@school-ahead/flashcards` — a separate
package from `preschool-games`, despite the shared "games" framing): page
components at its `src/` root, static-content types/fetch hooks in
`src/lib/flashcard-types.ts`/`src/lib/flashcards.ts`, and its Zustand
stores under `src/stores/`. `frontend/apps/web` only keeps the thin route
shells under `app/[locale]/(student)/games/cards/` (which render the
package's page components) and the `app/api/flashcard-*` Route Handlers
(which read `public/static/cards/**` off disk and import types from the
package's `@school-ahead/flashcards/types` subpath export).

## 2. Content structure

Every card set lives under `frontend/apps/web/public/static/cards/`, two
levels deep:

```
public/static/cards/
  <group>/
    title.json          # {"title": "Matematyka"}
    <set>/
      set.json
      img/
        <image files>
```

- `<group>` is a subject folder (e.g. `math`, `polski`). It needs a
  `title.json` (`{"title": "..."}`) to show up in the group picker at all —
  a group folder with no `title.json` (or none yet, like an
  in-progress `polski/`) is silently skipped rather than shown broken.
  `title.json` may also set `"language"` (one of `en`/`uk`/`pl`/`es`, e.g.
  `fizyka/title.json`: `{"title": "Fizyka", "language": "pl"}`) — every set
  under that group then defaults its TTS voice to it instead of the
  game-wide `en` fallback, still just a default a student can override per
  set from the ⚙ panel's language picker (see §6/stores/
  flashcard-language-store.ts). An invalid or missing `language` is ignored
  the same way an invalid/missing `title` is.
- `<set>` is one pickable deck within that subject (e.g. `7 klasa`). It
  needs a `set.json` with this shape:

```json
{
  "set": {
    "title": "Matematyka 7 klasa",
    "categories": [
      {
        "title": "Działania arytmetyczne i ich wyniki",
        "description": "optional, not currently shown in the UI",
        "items": [
          {
            "id": 1,
            "term": "Potęga",
            "translation": "Степінь",
            "image": "img/potęga.jpeg",
            "definition": "Wynik wielokrotnego mnożenia liczby przez samą siebie.",
            "formula": "g \\approx 10\\ \\text{m/s}^2 = 10\\ \\text{N/kg}"
          }
        ]
      }
    ]
  }
}
```

- `categories` are the deck's topics (розділ/тема) — each becomes an entry
  in the topic filter, and the quiz uses category membership to pick
  same-topic distractors (see §5).
- Every item field except `term` is optional: `translation`, `image`,
  `definition`, and `formula` may be omitted. `id` is accepted but not
  trusted —
  `/api/flashcard-set` renumbers every item sequentially server-side
  regardless of what (if anything) the JSON provides, since nothing else
  needs the author's original id to be stable and some sets in practice
  don't set one at all.
- `image` is either an absolute `http(s)://` URL (used as-is) or a path
  relative to the set's own folder (e.g. `img/potęga.jpeg`, resolved
  against `public/static/cards/<group>/<set>/`). A missing or broken image
  just fails its `<img>` load and the card falls back to whatever other
  fields it has — no build-time check that referenced files exist.
- `definition` may contain Markdown (bold, italics, lists via
  `remark-gfm`) — rendered without the shared `Markdown` component's
  `.prose` wrapper (which isn't dark-mode aware), so it inherits whatever
  color/size the card face already set.
- `formula` is raw LaTeX (e.g. `"g \\approx 10\\ \\text{m/s}^2 = 10\\
  \\text{N/kg}"`), rendered directly via KaTeX in display mode — unlike
  `definition`, the whole field is always math, so it's not wrapped in
  `$...$`/`$$...$$` delimiters the way an inline formula inside a
  `definition` would be. Use it for a physics/math constant or equation
  that belongs on the card alongside (or instead of) a prose `definition`;
  an invalid LaTeX source renders KaTeX's own inline error text rather than
  breaking the card.

Adding a new group or set is purely a filesystem change — drop the folder
in, no code change, no build step, no manifest to update elsewhere.

## 3. Routes

- `/games/cards` — subject/group picker (`FlashcardsGroupsPage`).
- `/games/cards/<group>` — set picker within that subject
  (`FlashcardsSetsPage`).
- `/games/cards/<group>/<set>` — the actual game (`FlashcardGamePage`) —
  this is the direct link a lesson embeds, e.g.
  `/games/cards/math/7 klasa`.

All three are public (no login required) — they fall under `/games`, which
`middleware.ts`'s `PUBLIC_PATHS` already exempts from the
locale/auth middleware for every other minigame.

Backing API routes (filesystem readers, same pattern as `/api/stories` /
`/api/story`):

- `GET /api/flashcard-groups` — lists every group with a valid
  `title.json`.
- `GET /api/flashcard-sets?group=<slug>` — lists every set with a valid
  `set.json` under that group, plus the group's own title.
- `GET /api/flashcard-set?group=<slug>&set=<slug>` — the full parsed set
  (categories + items with renumbered ids), plus the group's title and its
  `title.json`-declared default language (`groupLanguage`, `null` if unset
  or invalid).

`group`/`set` query params are bare folder names interpolated into a
filesystem path — both are validated (no path separators, no `.`/`..`,
length-capped) before touching disk, same rule `/api/story` applies to its
own `slug`.

## 4. Screens

- **Group picker** (`/games/cards`) — a grid of tiles, one per subject.
- **Set picker** (`/games/cards/<group>`) — a list of decks in that
  subject, each showing its title and card count; a back link returns to
  the group picker.
- **Game screen** (`/games/cards/<group>/<set>`):
  - Header: an icon-only back button (to the set picker) next to the set's
    title.
  - Toolbar: a ⚙ settings button and a 📊 results button on the left, a
    two-icon mode switcher on the right.
  - On a wide screen (`lg:` breakpoint and up), Навчання/Тест show a topic
    table-of-contents sidebar down the left side (`FlashcardTopicSidebar`)
    — collapsible via a toggle button, state persisted the same as the
    game's other shared UI preferences (`topicSidebarCollapsed`, stores/
    flashcards-store.ts); hidden entirely below that breakpoint and in
    Список, which already groups every card by topic inline. It's a second
    way to reach the same topic filter GameSettingsPanel's "Тема" `<select>`
    drives — picking a topic from either stays in sync.
  - The active mode's content (flip deck or quiz) below, centered.

## 5. Game modes

### Навчання (Learn — flip cards)

One card at a time (`FlashcardLearnDeck` + `FlipCard`). Tapping it flips it
via a real 3D transform (`rotateY`, front/back as two
`[backface-visibility:hidden]` faces sharing one box) rather than a fade or
layout swap. After flipping, «Знаю» (Know) drops the card out of the
queue; «Повторити» (Repeat) sends it to the back of the queue. The round
ends exactly when every card has been marked known at least once, then
shows a completion screen with a restart button. A progress bar tracks
"known so far / total".

### Тест (Quiz)

Multiple choice, capped at 10 random questions per round
(`FlashcardQuiz`). Each question shows the card's front and up to four
option cards showing the back; picking the right one is checked by card
identity (not by comparing rendered text, so front=translation/back=term
setups quiz correctly in the reverse direction too). Wrong options are
drawn from the same category as the question's card first, only reaching
into other categories if that category alone doesn't have enough cards to
fill all four — and never duplicate another option's rendered content. The
result screen shows a percentage progress bar (same slate visual treatment
as the learn deck's bar — no green) plus the raw score, and a restart
button.

Both modes read the same topic filter — "Усі теми" (all categories
flattened) or one specific category — set from the ⚙ panel (see §6).

## 6. Card display configuration

What a card's front and back actually show is fully configurable, field by
field, from the ⚙ settings popup (`GameSettingsPanel`) — not hardcoded to
"term+image front, translation+definition back". The popup has two
sections:

- **Тема** — the topic filter described above.
- **Картка** — two independent checkbox groups, "Лицева сторона" (front)
  and "Зворотна сторона" (back), each offering Термін (term) / Переклад
  (translation) / Зображення (image) / Означення (definition) / Формула
  (formula). At least one box per side must stay checked. Both game modes
  render through the same `CardFaceContent` component, so this one choice
  applies to Навчання and Тест alike.

If a card is missing a field the student checked for a given side (e.g.
"translation" checked, but this particular card has none), that face falls
back to whatever fields the card does have, rather than rendering blank —
the same graceful-degradation rule the content format applies to a missing
image.

This preference is persisted client-side (`src/stores/flashcards-store.ts`, a
Zustand store with `persist`, localStorage-backed) and shared across every
set the student opens — it's a personal study preference, not a per-set
setting.

## 7. Quiz results history

Every completed Тест round is recorded client-side
(`src/stores/flashcard-quiz-results-store.ts`): group, set, topic, score,
total, and a completion timestamp, capped at the 200 most recent attempts
across all sets. The 📊 button opens a popup listing past attempts *for
the currently open set only*, newest first, each row showing the date and
`score/total · percent%`. This is a student-local scratch history (plain
localStorage, nothing sent to the backend) — not a graded record.

## 8. Personal cards & importing from JSON

Unlike the rest of this doc (static `public/static/cards/**` decks, no
login required), a student's *personal* cards are backend-backed
(`backend/cards/`) and require auth. Implementation:
`frontend/apps/web/components/translatable-content.tsx`/
`read-along-content.tsx`'s "Додати до карток" button saves a translated
word from a lesson's content as a `cards.models.StudentCard`, and
`useFlashcardGroups`/`useFlashcardSets`/`useFlashcardSet`
(`src/lib/flashcards.ts`) merge those in alongside the static groups so
the rest of the game (learn deck, quiz, list, print, settings) needs no
changes to play them.

A `StudentCard` is always tied to a real curriculum Subject — its group is
always `subject-<id>`, never a subject-less bucket. Within that group, its
"set" is one of two things:

- Normally, a real Topic (`lesson` FK; Topic = set `topic-<id>`, Lesson =
  category) — the structure it was saved from while reading a lesson.
- Or, for a bulk import whose topic/lesson titles don't match real
  curriculum, a personal `StudentCustomTopic` → `StudentCustomLesson`
  chain (`custom_lesson` FK; set `custom-<id>`) — still tied to the same
  real Subject, just not a real Topic. `StudentCard.lesson`/`custom_lesson`
  are nullable, exactly one set per card (a DB `CheckConstraint`). A real
  `topic-<id>` set and a personal `custom-<id>` one can appear side by side
  under the same `subject-<id>` group.

A student can bulk-import a whole set.json-shaped deck as personal cards
from the Cards game's group picker, or from a Subject's own Картки tab
(`FlashcardImportDialog`, student-only, both places pass through the same
component). Either way the student picks a real Subject — from the Subject
page it's pinned and shown read-only (`fixedSubject`, since it's already
known and shouldn't be second-guessed); from the group picker it's a
required `<select>` populated from `GET /academics/my-subjects`. This
guarantees the cards always end up on that exact Subject's own Картки tab,
never somewhere else. The dialog then reads a local `.json` file — the
same shape a static `set.json` uses, `{"set": {"title": ..., "categories":
[{"title": ..., "items": [...]}]}}`, or the bare `{title, categories}`
underneath — and posts `{subject_id, title, categories}` to `POST
/cards/import` (`cards.services.import_card_set`). `title` is matched
(case-insensitively) against a real Topic under that Subject; if it
matches *and* every category's title also matches a real Lesson under that
Topic, the cards are attached there directly — same place a from-a-lesson
card would land. Otherwise (no matching Topic, or a partial lesson match)
the *entire* import is instead filed under a `StudentCustomTopic` of the
same title under the same Subject (get-or-created, so re-importing merges
rather than duplicating) — deliberately never split across a real Topic
and a personal one, so a student always finds a whole deck in exactly one
place. This path never creates a real Subject/Topic/Lesson: those stay
tutor/admin-authored curriculum (see
`lessons.services.import_topics_and_lessons` for that separate,
tutor-facing "load lessons.json" flow) — an import can't leak into a
class's schedule, course listing, or completion %.

Only `term`/`translation`/`definition` survive an import — `StudentCard`
has no `image`/`formula`/`sound` fields, so those keys (if present in the
source file) are silently dropped, same limitation the personal-cards path
already had before this feature.

## 9. Design notes

- No shared UI kit component library is used here (no shadcn/ui in this
  repo) — plain Tailwind utility classes throughout, slate/white palette
  with explicit `dark:` variants.
- Icons are `lucide-react` (already a dependency), not emoji — matching
  the "no childish elements" requirement, unlike the emoji-heavy preschool
  games.
- No sound, no background music, no confetti/particle effects, no
  Diamond/gamification integration — this is a plain, quiet study tool.
