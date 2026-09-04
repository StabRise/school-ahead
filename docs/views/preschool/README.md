# Preschool View

Documents what's actually built, as of this writing. `ideas.md` in this same
folder and `docs/interfaces/student/preschool/lesson.md` are the original
design briefs this was built from — kept for history, not fully in sync with
the implementation below.

## 1. Overview

`preschool` is one of two interface modes a student can be in, alongside
`default`. It's a per-student, persisted preference — not a route or a
theme — so the same URLs (`/`, `/calendar`, `/lessons/[id]`) render
completely different UIs depending on the mode.

* **Storage:** `StudentProfile.interface_mode` (`accounts/models.py`,
  `InterfaceMode.DEFAULT` / `InterfaceMode.PRESCHOOL`).
* **Read/write:** `GET /api/auth/me` returns it on `UserOut.interface_mode`;
  `PATCH /api/auth/me/interface-mode` changes it
  (`backend/accounts/api.py`).
* **Toggle UI:** `PreschoolModeToggle`
  (`frontend/components/preschool-mode-toggle.tsx`), a switch in the
  header's user dropdown menu.
* **Frontend read:** `useAuthStore().user.interfaceMode` — hydrated from
  `/auth/me` via `mapApiUserToAuthUser` (`@school-ahead/api-client`'s
  `map-user.ts`).

Every shared route has a thin client-component wrapper that branches on
`interfaceMode` and renders either the existing (`default`) UI or a
`Preschool*` component. None of the three duplicate any data-fetching logic
they don't need to — they mostly reuse the same Orval hooks as the default
views.

| Route | Wrapper | Default component | Preschool component |
|---|---|---|---|
| `/` | `frontend/components/student-dashboard.tsx` | inline list | `PreschoolGameMap` / `PreschoolCelebration` |
| `/calendar` | `frontend/components/calendar/student-calendar-view.tsx` | `WeeklyCalendar` | `PreschoolCalendar` |
| `/lessons/[id]` | `frontend/components/lesson-wizard/student-lesson-view.tsx` | `LessonWizard` | `PreschoolLessonView` |

Preschool-specific code is split across a bun workspace (see
`docs/architecture/06-frontend-architecture.md`): the five minigames and
their game-specific state/logic live in the `@school-ahead/preschool-games`
package (`frontend/packages/preschool-games/`); presentational pieces
reused across games *and* these dashboard/lesson screens (Raccoon,
ScreenFrame, the decorations, the diamond-flight animation, the "big card"
quiz UI, ...) live in `@school-ahead/preschool-ui`
(`frontend/packages/preschool-ui/`); the screens listed in the table above
that are tightly coupled to the general lesson wizard (`PreschoolLessonView`,
`PreschoolQuizGame`) stay in the app itself, under
`frontend/apps/web/components/preschool/`.

## 2. "My Today's Lessons" — the Adventure Road (`/`)

Component: `game-map.tsx` → `PreschoolGameMap`, fed `[...backlog, ...today]`
from `useGetToday()` (`schedule/today`) by `student-dashboard.tsx` — tails
walk through the same path as today's lessons, not a separate screen.

* **Layout:** a boustrophedon ("shelf") snake — a row of steps left-to-right,
  then the next row right-to-left, and so on. Row length is responsive
  (`columnsForWidth`): 2 columns under 420px, up to 5 above 760px, measured
  live via a `ResizeObserver` (`useMeasuredWidth`).
* **The path itself:** a Catmull-Rom spline (`buildSegments`/
  `segmentsToPathD`) through every node's exact center, rendered as a
  two-tone amber ribbon with a dashed center line — a real curled trail, not
  a straight line or a stone-tile mosaic (both tried and dropped per
  feedback).
* **Node states**, by `StudentLessonStatus`:
  * `completed` → `CompletedCoin` — a small gold star-coin with a bee.
  * `pending_review` → `PendingReviewNode` — pale/grayscale, non-clickable;
    deliberately distinct from both "done" and "active" so a child doesn't
    think they still need to do it, or that it's finished.
  * first non-`completed`/non-`pending_review` item → the "current" node:
    biggest (`CIRCLE_CURRENT`), swaying (`node-sway` keyframe), flanked by
    two fluttering butterflies.
  * everything else actionable → a normal-sized clickable node
    (`CIRCLE_UPCOMING`).
* **Icon fallback chain** (`StepIcon`): `lesson.icon` →
  `subject.icon` → `DefaultStepIcon` (a flat cartoon star). The backend
  resolves the first two into `CalendarItemOut.lesson_icon` /
  `.subject_icon` (`scheduling/api.py`, `scheduling/schemas.py`).
* **Scenery:** clouds, sun, a hedgehog, and scattered mushrooms/flowers/a
  ladybug along the path (`TrailDecorations`, positions from a deterministic
  `pseudoRandom` seed so they never shift between server/client render).

### Celebration minigames

Component: `game-choice.tsx` → `PreschoolCelebration`. Trigger, computed in
`student-dashboard.tsx`:

```
const READY_FOR_GAME_STATUSES = ["completed", "pending_review", "need_help"];
backlog.every(item => READY_FOR_GAME_STATUSES.includes(item.status)) &&
  today.every(item => READY_FOR_GAME_STATUSES.includes(item.status))
```

i.e. not just today's lessons — every tail has to be cleared too. A lesson
counts as cleared once it's Completed or waiting on someone else (Pending
Review, Need Help); Assigned/In Progress/Revision Required still block it.
`.every()` is vacuously true on an empty array, so a day (and backlog) with
no lessons at all celebrates too.

`PreschoolCelebration` first shows a game picker (Balloons is the visually
highlighted default among five cards — see below) and, once the child taps
one, renders that minigame full-screen with a small "🔁" button
(bottom-left) to go back and pick a different one. Neither minigame's
in-progress state is persisted between visits — the picker shows again next
time the trigger fires (though each game's own *settings*, e.g. a chosen
consonant or language, are `localStorage`-persisted independently — see
each game's own doc). The exact same picker, reused as-is
(`@school-ahead/preschool-games`'s `game-choice.tsx`'s `GamePicker`), also
backs the standalone `/games` route (`games-page.tsx`), which links each
choice to its own URL (`/games/balloons`, `/games/trains`,
`/games/reading`, `/games/cards`, `/games/stories[/<story>]`) instead of
swapping local state — so a game (a specific story, for "Казки") is
directly linkable/bookmarkable there. Every one of these routes is public
(`middleware.ts`'s `PUBLIC_PATHS` covers all of `/games`) — an anonymous
visitor can play any of the five, they just don't earn Diamonds (see
`docs/core/gamification.md`).

* **Balloon Pop** (`balloon-pop-game.tsx` → `BalloonPopGame`, see
  `docs/preschool/games/balloon game/README.md` for the full picture) —
  balloons spawn on an interval, drift down, and pop on tap with a particle
  burst and a procedural Web-Audio "pop". Content (modes, images, recorded
  pronunciations, translations) is entirely folder-driven from
  `public/static/balloon-game/` — adding a mode is a filesystem change,
  no code. A ruby-icon counter tracks rubies earned this session (popping a
  balloon, or tapping any flashcard on the "learning" screen) and, every 30
  rubies, awards a Diamond via `POST /auth/me/balloon-pop-reward`.
* **Letter Train** (`trains-game.tsx` → `TrainsGame`) — a train slides in
  from the left carrying a big letter on its wagon, parks in the middle,
  and waits for the child to press the matching key on a physical keyboard
  (`window` `keydown`, matched case-insensitively against the letter — this
  minigame needs a real keyboard, unlike the tap-driven balloon game). A
  correct press plays a synthesized chime, flies that letter from the train
  to the right-side "collected" panel (a plain absolutely-positioned
  animation local to this game, not the header-reaching
  `@school-ahead/preschool-ui`'s `flying-diamond.tsx`), the train departs to the right, and the
  panel's running list/count updates. Language is English/Ukrainian only
  here (unlike the balloon game, which also offers Polish) — the settings
  panel additionally has a keyboard-zone picker (all / left / center /
  right third of the physical keyboard, `KEYBOARD_ZONES` in
  `trains-game.tsx`) that narrows which letters the train hands out, e.g.
  for practicing one hand's reach at a time. Letter Train speaks the letter
  once the train parks. Every 10 letters collected flies a 💎 to the header
  (the shared `flying-diamond.tsx` animation this time) via
  `POST /auth/me/trains-game-reward` — see `docs/core/gamification.md`.
* **Склади** (`reading-game.tsx` → `ReadingGame`, see
  `docs/preschool/games/reading/README.md`) — a consonant's syllable cards
  (e.g. МА, МО, МУ) sit in a row; the child drags a picture card (e.g. МЕД)
  onto the syllable it starts with. A correct drop snaps the card into
  place, chimes, and speaks the syllable then the full word; clearing every
  card in a level speaks a celebration and awards a Diamond via
  `POST /auth/me/reading-game-reward`. Content (which consonants/syllables
  exist) is folder-driven from `public/static/reading-game/`.
* **Картки** (`cards-game.tsx` → `CardsGame`, see
  `docs/preschool/games/reading/Cards.md`) — flashcards for one consonant's
  syllables, drawn from `public/static/letters/`. A "Навчання" (learning)
  screen lets the child tap each card at their own pace; a "Гра" (game)
  screen tests recognition, with falling cards to tap against a
  spoken/shown target syllable — a star per correct match, every 10 stars
  awarding a Diamond via `POST /auth/me/cards-game-reward`.
* **Казки** (`stories-game.tsx` → `StoriesGame`/`StoriesGamePage`, see
  `docs/preschool/games/reading/Stories.md`) — a picker of "books"
  (`story-book.tsx`) leads into one story's Markdown text, where inline
  `{...}` references render as tappable syllable/picture cards (tapping one
  opens it full-screen, no read-aloud). Logged-in students earn a star per
  card opened and a Diamond every 5 stars via
  `POST /auth/me/stories-game-reward`. Public like every other minigame
  (`/games/stories[/<story>]`, no login needed) — the header's "Вчуся
  Читати" link for a signed-out visitor points here.

## 3. Weekly Calendar (`/calendar`)

Component: `calendar-view.tsx` → `PreschoolCalendar`. Same
`schedule/calendar` + `schedule/backlog` hooks as the default
`WeeklyCalendar`, restyled for a 6-year-old:

* One rainbow color per weekday (Monday=rose … Sunday=fuchsia), **stable
  across weeks** — the color is a memorization aid, not decoration, so it
  never shuffles.
* Each day is a card of round icon bubbles (`LessonBubble`,
  `frontend/components/preschool/lesson-bubble.tsx` — shared with the
  backlog section below) instead of a text list; completed ones get a small
  checkmark badge. An empty day shows a friendly "Вихідний!" placeholder
  instead of looking broken.
* `PreschoolBacklogSection` (`backlog-section.tsx`) renders below the week
  grid — same component the "My Today's Lessons" page uses.
* `Cloud`/`Sun` from `decorations.tsx` are `position: absolute` (built for
  background decoration); this page defines local `InlineCloud`/`InlineSun`
  for the in-flow "empty day" icon and the "today" marker instead of
  reusing them — mixing the two breaks layout.

## 4. Lesson View (`/lessons/[id]`)

Component: `lesson-view.tsx` → `PreschoolLessonView`. Takes over the whole
viewport (`fixed inset-0`) — the header hides itself for these routes when
`interfaceMode === "preschool"` (see `Header.tsx`). A round exit button
(top-left, links to `/`) is the only way out.

Two steps, held as local state (not persisted — purely a client-side
"which panel" toggle, same as the default `LessonWizard`'s
materials/assessment switch):

### Step 1 — Magic Screen

Big rainbow-gradient lesson title, then the lesson's `content` (markdown,
usually a YouTube embed) inside `ScreenFrame` — a reusable "cottage window"
panel (wooden border, roof triangle, flower pots) used everywhere a screen
needs framing. A "Далі 🎉" button advances to step 2.

### Step 2 — Practice Clearing

Branches on `StudentLessonOut.status` / `lesson.lesson_type`:

| Condition | Renders |
|---|---|
| `status === "completed"` | `CelebrationScene` |
| `status === "need_help"` | idle raccoon + `ResolveNeedHelpButton` |
| `status === "pending_review"` | idle raccoon + waiting message |
| `status === "revision_required"` | the shared `TaskStep`, in a `ScreenFrame` |
| `lesson_type === "with_quiz"` | `PreschoolQuizGame` |
| `lesson_type === "theory"` | `PreschoolTheoryCheck` |
| `lesson_type === "with_task"` | the shared `TaskStep`, in a `ScreenFrame` |

**`PreschoolQuizGame`** (`quiz-game.tsx`) — one question at a time inside a
`ScreenFrame`: a gradient banner (prompt, rendered as markdown) and big
tappable answer cards (`QuizChoice.text`, also markdown). On tap:

1. `GET /api/student-lessons/quiz-questions/{id}/hint` resolves the correct
   choice (a dedicated per-question, on-demand endpoint — `is_correct` is
   never included in the quiz payload itself, so the answer key is never
   shipped up front).
2. The raccoon mascot reacts (`happy`/`sad`), the tapped and correct cards
   get outlined, and after ~1.6s it auto-advances.
3. If the child hasn't answered within 15s, the same hint endpoint fires
   automatically and the correct card gets a pulsing glow — the raccoon
   points at it (`hint` mood) without answering for them.
4. The last question still submits through the real
   `POST /{student_lesson_id}/submit-quiz` — the hint mechanism is a UX
   nicety layered on top, not a shortcut around real grading.

A pass (`score > 60%`) shows `CelebrationScene`; a fail shows a sad raccoon
and a retry button that resets to question 1.

**`PreschoolTheoryCheck`** (`theory-check.tsx`) — "Чи все зрозуміло?" as two
big picture cards instead of plain Yes/No buttons: a happy raccoon for
"yes", a sad-faced raccoon (always, not just after picking) for "потрібна
допомога" — the sad face itself signals what that button means before the
child even taps it.

### `CelebrationScene` (`celebration-scene.tsx`)

Shown both for a fully-completed lesson and for a passed quiz. A themed
panel: sunbeams, a bunting garland, twinkling fireflies, dandelions, a
mushroom, a one-shot confetti burst, a procedural fanfare chime, a wooden
stump piled with coins/crystals, and the raccoon (bouncing, holding a
trophy) — with the title/subtitle text and a big swaying "home" button
(icon-only, same `node-sway` animation as the road's current-step node)
stacked underneath, centered.

## 5. Shared building blocks

* **`Raccoon`** (`raccoon.tsx`) — the mascot, `mood: "idle" | "happy" |
  "sad" | "hint"`. Used across the quiz game, theory check, celebration
  scene, and the calendar/road's waiting states. Not (yet) swapped for the
  student's chosen avatar — see §7.
* **`ScreenFrame`** (`screen-frame.tsx`) — the wooden cottage-window panel,
  reused for lesson content, the quiz, and the theory check, so every
  "screen" in the experience reads as the same object.
* **`decorations.tsx`** — `Cloud`, `Sun`, `Mushroom`, `Daisy`, `Tulip`,
  `Bluebell`, `Ladybug`, `Hedgehog`, `Bee`, `Butterfly`, `DefaultStepIcon`.
  `Cloud`/`Sun` are hard-coded `position: absolute` for background use;
  don't reuse them in-flow (see §3).
* **`LessonBubble`** / **`PreschoolBacklogSection`** — the round icon link
  and the "Хвостики" panel, shared by the calendar and the adventure road.
* **`random.ts`** — `pseudoRandom(seed)`, a deterministic PRNG so decorative
  placement never shifts between server and client render (a real
  `Math.random()` would cause hydration mismatches).

## 6. Backend surface added for this feature

* `accounts`: `InterfaceMode`, `StudentProfile.interface_mode`,
  `PATCH /auth/me/interface-mode`.
* `lessons`/`academics`: `Lesson.icon`, `Subject.icon` (both plain
  `FileField`s, not `ImageField` — no Pillow dependency), exposed on
  `LessonOut.icon` / `SubjectOut.icon` and, pre-resolved with fallback, on
  `CalendarItemOut.lesson_icon` / `.subject_icon`.
* `lessons`: `GET /student-lessons/quiz-questions/{id}/hint` →
  `QuizHintOut.correct_choice_id`, scoped to lessons the requesting student
  actually has (`services.get_own_student_profile` + an ownership check).
* `lessons` admin: `LessonAdmin.save_model` assigns a random icon from
  `backend/sample_media/lessons/` to a brand-new `Lesson` with no icon set
  (`common/storage.random_sample_lesson_icon`) — create-only, never
  overrides an icon you set or touches an existing lesson on edit.

## 7. Related, but out of scope so far

* **`docs/core/avatar.md`** — the companion-character system. Selection is
  built (`Avatar` model, `/auth/avatars`, `PATCH /auth/me/avatar`, the
  `/profile` page's `AvatarPicker`), but the chosen avatar isn't wired into
  the mascot anywhere yet — `Raccoon` in this feature is still hard-coded
  regardless of what a student equips. The wardrobe/shop (Diamonds) and
  home-decoration systems that doc also describes aren't started.
* **Leaderboards** (mentioned in `avatar.md` as a place the avatar shows
  up) don't exist yet at all.
