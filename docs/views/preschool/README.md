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
  (`frontend/components/preschool-mode-toggle.tsx`), a switch on the preschool
  dashboard's top row — and, in any other mode, in the header's user dropdown
  menu (a student in preschool mode has no header, see below).
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
| `/` | `frontend/components/student-dashboard.tsx` | inline list | `PreschoolDashboard` (§1.1) |
| `/lessons` | — (preschool only; anyone else is sent to `/`) | — | `PreschoolLessonsRoad`: `PreschoolGameMap` / `PreschoolCelebration` (§2) |
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

### 1.1 The dashboard (`/`) and the missing site header

A student in preschool mode has **no classic site header** on any page
(`Header` renders nothing for them; `useIsPreschoolStudent`). What stands in for
it:

* **The dashboard, `/`** (`components/preschool/dashboard.tsx` →
  `PreschoolDashboard`): a top row — "Привіт, {first name}!", the 💎 balance and
  the preschool-mode switch — over a grid of big emoji cards: **Мої уроки** 🗺️
  (`/lessons`, the road below), **Предмети** 📚 (`/subjects`), **Календар** 📅
  (`/calendar`), **Ігри** 🎈 (`/games`), **Казки** 🧚 (`/games/stories`) and
  **Профіль** (`/profile`), which shows the child's own dressed avatar (the
  raccoon until they have picked one) instead of an emoji. A waving **👋** preschool
  button beside them says bye: it signs the child out (`lib/use-sign-out.ts`, shared
  with the classic header's menu) and goes to the login page — the header's menu was
  the only place for that. The mode switch is the way back to the classic mode.
* **The 💎 balance and the preschool-mode switch on every page.** The dashboard
  has them in its top row; every other preschool page has the same two as small
  pills fixed in the **bottom-right corner** (`components/preschool/chrome.tsx`,
  above a lesson's fullscreen overlay too) — the one corner no page uses for its
  own controls, except the balloons and cards games' "game / learning" switch,
  which slides left for a preschool student (`[html[data-headerless]_&]:right-72`).
  The badge keeps `data-diamond-badge`, so a diamond flies to it wherever the child
  earns one.
* **A 🏠 back to the dashboard on every other page**, so there is always a way
  home (`components/preschool/chrome.tsx`; which page gets which:
  `lib/preschool-chrome.ts`):
  * the pages with a home button of their own keep it — a lesson's exit, the subject
    page's way back to the shelf, a game's way back to the picker, and the road's
    (`/lessons`) and the celebration picker's (shown there once all lessons are
    done);
  * the bookshelf, the calendar, the game picker and the profile get a 🏠
    **fixed in the top-left corner**, out of the layout, so their headings stay at
    the top (the profile's heading is kept clear of it);
  * any other page (house, achievements, settings, ...), whose content may start in
    that corner, gets a slim sky-coloured strip with the 🏠 above it.
* **The games move their fixed controls to the top of the screen.** They sit
  below the header (`top-20`) for everyone else; `PreschoolChrome` marks the page
  `<html data-headerless>` for a preschool student and the `[html[data-headerless]_&]:`
  variants in `preschool-games/src/kit/game-controls.ts` take over (`top-4`).

## 2. "My Lessons" — the Adventure Road (`/lessons`)

Formerly the preschool dashboard at `/`. Component: `game-map.tsx` →
`PreschoolGameMap`, fed `[...backlog, ...today]` from `useGetToday()`
(`schedule/today`) by `components/preschool/lessons-road.tsx` — tails walk
through the same path as today's lessons, not a separate screen. It has a 🏠 of
its own back to the dashboard; a lesson opened from it exits back to it
(`lib/lesson-exit.ts`).

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
* **Taking a lesson back off the road:** an actionable node the child picked
  themselves shows a small minus button on its top-right corner
  (`CancelLessonButton`, beside the node's link so a tap never also opens the
  lesson). It appears only when `CalendarItemOut.can_cancel` is true —
  self-selected, not completed, no submission and no comment (computed in
  `scheduling/api.py`, matching `DELETE /student-lessons/{id}`,
  `lessons.api.cancel_self_selected_lesson`). After a confirm it deletes the
  `StudentLesson` and the dashboard reloads (`onLessonCancelled`).
* **Icon fallback chain** (`StepIcon`): `lesson.icon` →
  `subject.icon` → `DefaultStepIcon` (a flat cartoon star). The backend
  resolves the first two into `CalendarItemOut.lesson_icon` /
  `.subject_icon` (`scheduling/api.py`, `scheduling/schemas.py`).
* **Scenery:** clouds, sun, a hedgehog, and scattered mushrooms/flowers/a
  ladybug along the path (`TrailDecorations`, positions from a deterministic
  `pseudoRandom` seed so they never shift between server/client render).

### Celebration minigames

Component: `game-choice.tsx` → `PreschoolCelebration`. Trigger, computed in
`components/preschool/lessons-road.tsx`:

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
  exist) is folder-driven from `public/static/letters/`.
* **Картки** (`cards-game.tsx` → `CardsGame`, see
  `docs/preschool/games/reading/Cards.md`) — flashcards for one consonant's
  syllables, drawn from `public/static/syllables/`. A "Навчання" (learning)
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
viewport (`fixed inset-0`) — there is no site header for a preschool student
(§1.1). A round house button (top-left) is the only way out: it goes back to the
road (`/lessons`) or the dashboard (`/`) if the child opened the lesson from
there, otherwise to the lesson's own subject page
(`/subjects/<id>`). The destination is decided when it's tapped, from the
previous in-app route that `RouteTracker` (mounted in the root layout) keeps in
`sessionStorage` — `lib/route-history.ts`, `lib/lesson-exit.ts`. A lesson can
be opened from the road, the calendar, a backlog bubble, the
subject page or the lesson preview, so links aren't tagged individually.

All the round buttons on this screen — the exit 🏠 (top-left), the "next" arrow
and the heart (top-right, the heart just left of the arrow while the arrow shows,
in the corner itself once it doesn't) and the ⚠️ below — are the same 36px size
as a screen's ⚙️: `PreschoolButton` is compact by default (`compact={false}` with a
`sizeClassName` gives a big one).

A heart `PreschoolButton` (`FavoriteButton`) marks the lesson as one of the child's favourites — `StudentLesson.is_favorite`,
set through `PATCH /student-lessons/{id}/favorite`. The heart flips at once
and is rolled back if the request fails.

A ⚠️ `PreschoolButton` (`ReportProblemButton`), pinned to the bottom-left corner
of the screen, is for "something is wrong with this lesson" (the video won't play, ...). Tapping it sets
`Lesson.need_review` through `POST /student-lessons/{id}/report-problem` — the
flag is on the *lesson*, not the student's copy, since it's the lesson that needs
fixing — and the button turns into a green ✅ (also shown for a lesson someone
else already flagged). Tutors see flagged lessons in the "Уроки з проблемами"
section of their dashboard (`lessons-needing-review.tsx`, `GET
/tutor/lessons-needing-review`, filtered by the dashboard's subject and class
selectors) as the same `PreschoolLessonTile` cards a child sees: the card opens
`/tutor/lessons/{id}`, and small buttons down its right edge mark the problem
fixed (`PATCH /tutor/lessons/{id}/need-review`), delete the lesson or — only while the lesson has no picture — load its
YouTube thumbnail. Deleting a lesson students have asks for a stronger confirmation
(it names how many students, and that their work goes with it) and is sent with
`?force=true`; without `force`, `DELETE /tutor/lessons/{id}` still answers 409 for
an assigned lesson, as everywhere else.

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

### Bookshelf (`/subjects`)

Component: `PreschoolSubjectsShelf` (`packages/preschool-ui/src/subjects-shelf.tsx`).
A row of category pictures (subject groups) centred at the top, and a shelf of
books (subjects) under it. Tapping a category shows only its books; tapping the
chosen one again clears it.

The ⚙️ in the top-right corner picks **which subjects and categories show**
(`subjects-display.ts`), kept on this device in a persisted zustand store
(`subjects-display-store.ts`):

* **Вибрані вчителем** (`marked`, the default) — only what a tutor marked
  (`Subject.is_marked`, `SubjectGroup.is_marked`). A tutor marks them with the
  👁 button on each subject row and group header of the class page
  (`/tutor/classes/{id}`), or in the Django admin. Everything that existed when
  the field was added was marked by its migration, so nothing vanished; anything
  created since starts unmarked. Both marks are needed: an **unmarked category
  hides all of its subjects**, marked or not (a subject with no category needs
  only its own mark).
* **Усі предмети** (`all`) — every subject of the student's class, as before.
* **Улюблені** (`favorites`) — only the subjects the student hearted
  (`FavoriteSubject`, below). Its categories are the ones those subjects belong
  to.

The panel has a second choice under a divider, **what tapping a lesson does**
(`lesson-open-mode.ts`, persisted in `lesson-open-mode-store.ts`, for every subject and
for visitors too): **Відкрити урок** (`open`, the default — as it always was) or **Грати
відео на весь екран** (`fullscreen`, see the subject page below). One subject can choose
for itself with the ⚙️ on its own page, which wins over this one (below).

A category is only offered when at least one subject of the current view
belongs to it. The visitor-facing shelf (signed out, see
`docs/core/public_access.md`) has the ⚙️ too, with two views — **marked** (the
default) and **all**; there are no favourites without an account, and a
"favourites" choice remembered from a signed-in session on the same device falls
back to the default.

### Subject page (`/subjects/[id]`)

Component: `preschool-subject-detail-page.tsx` → `PreschoolSubjectDetailPage`
(the bookshelf at `/subjects`, `subjects-shelf.tsx`, leads here). One grid
of lesson cards with one tab per topic (big pill buttons, scrolling sideways
when there are many; hidden when only one topic has lessons to show), headed by
a 🏠 `PreschoolButton` back to the shelf, the subject name, a ❤️ (at the right, before the ⚙️) that marks the
subject as a favourite (`FavoriteSubject` — per student, so it follows them
between devices; `PATCH /student-lessons/subjects/{id}/favorite`,
`GET /student-lessons/favorite-subjects`; not shown to a signed-out visitor) and
the points badge — the ❤️ sits at the right, just before the ⚙️. Semester blocks (`SubjectBlock`) are not shown here. The open
topic is kept in `?topic=<id>`, so coming back from a lesson lands on the same
tab; a topic with no lessons left under the current filter gets no tab.

* **Cards** (`PreschoolLessonTile`) have one fixed height per breakpoint —
  never derived from their content or picture, so they don't change size as
  more load. A card with a picture (`Lesson.icon`, falling back to the
  subject's icon) is the picture with the title under it; one with neither is
  a coloured gradient card.
* **No preview page:** a lesson the child has no `StudentLesson` for yet (listed
  only when `StudentProfile.can_do_any_lesson` is set) isn't sent to
  `/lessons/preview/<id>` as in the other modes. Tapping it creates today's
  `StudentLesson` straight away (`POST .../lessons/{id}/start-today`, the same
  call the preview's button makes) and opens the lesson (`StartLessonCard`).
* **▶ play the songs of the open topic:** for a topic whose lessons are YouTube
  links (a "songs" subject), a ▶ in the header — for a visitor who isn't signed in
  too — opens an overlay player (`components/subjects/subject-player.tsx`) that
  plays every song of the **open topic (tab)** one after another (switch tab, and it
  is that topic's songs): the video, the song's title, ⏮ ⏯ ⏭,
  a "n з m" counter and a list to jump around in; ✕ or Escape closes it and stops the
  music. A ⛶ preschool button takes the whole player fullscreen — the browser's Fullscreen
  API where there is one, otherwise the same layout filling the window (iPhone Safari
  has fullscreen only for a bare `<video>`). Fullscreen is near-black all round and
  edge to edge (no side margins): the video fills the screen with no bar on top, and a
  slim bar underneath holds the title (small) on the left, ⏮ ⏯ ⏭ in the middle, and on
  the right the way out of fullscreen and ✕; the song list is hidden. The video
  container is the same element in both layouts, so toggling never rebuilds the
  video. Escape leaves fullscreen first, and only then closes the player. The queue is a
  snapshot taken when the player opens, so a refetch of the playlist never rebuilds the
  video or moves the queue. It comes from `GET /student-lessons/subjects/{id}/playlist?topic_id=`
  (public: `/public/subjects/{id}/playlist?topic_id=`): one track per lesson of that
  topic with a YouTube link in its content (the first, like the lesson screen), in
  lesson order, **whatever the ⚙️ lessons filter** (a finished song still plays),
  capped at 1000 (`lessons.services.topic_playlist`). It is fetched once the page has
  loaded, and again for each tab opened, and the ▶ only shows when the open topic has
  at least one song. Playback uses the YouTube IFrame
  Player API (`lib/youtube-iframe-api.ts`) — a plain `<iframe>` can't say when a video
  ends — with one player reused for every song (`loadVideoById`), so the sound the
  child asked for by tapping ▶ carries on. A video YouTube won't embed is skipped
  (`lib/playlist-queue.ts`); if none plays, the player says so instead of looping. The
  queue ends after the last song (no repeat or shuffle yet).
* **Per-subject choice.** The subject page's ⚙️ (`preschool-lessons-filter-button.tsx`)
  has, under the lessons filter, the same choice for **this subject only**: *Як на
  полиці* (`inherit`, the default — follow the bookshelf), *Відкрити урок* or *Грати відео
  на весь екран*. It is kept on this device (`bySubject` in the same persisted store,
  keyed by subject id; choosing *Як на полиці* forgets it) and resolved by
  `resolveLessonOpenMode`: the subject's own choice, else the bookshelf's. A visitor who
  isn't signed in has no lessons filter, so the ⚙️ they get here holds just this choice.
* **Play a lesson fullscreen** (the ⚙️ on the bookshelf, or the subject's own, set to *Грати відео на весь екран*):
  tapping a card whose lesson has a video doesn't open the lesson (nor create a
  `StudentLesson` for it) — it opens the same player, fullscreen, on that lesson's song,
  and plays on from there through the rest of the open topic. A card with no video opens
  as usual, and so does every card while the setting is on *Відкрити урок*. The player asks the
  browser for fullscreen when opened (the tap is still fresh enough to allow it); refused,
  or where there is no Fullscreen API, it fills the window; leaving the browser's fullscreen
  (Escape) leaves the framed player, still playing. Works for a visitor who isn't signed in.
* **The ✅ and ❤️ in the player** (a signed-in student; `subject-player-actions.tsx`, drawn
  into the player's `trackActions` slot) sit beside the fullscreen / leave-fullscreen
  button, in the framed player and in fullscreen alike, and act on the song being played:
  ❤️ marks the lesson as a favourite (`StudentLesson.is_favorite`, same as the lesson
  screen's heart; it flips at once and rolls back if the request fails); ✅ marks it done the
  way the lesson screen's "Чи все зрозуміло?" → "Так" does (`GET` the lesson to start it, then
  `POST .../confirm-understanding`), and turns into a green ✅ once done. **Only a `theory`
  lesson offers ✅** — a quiz or a task is finished by its own quiz or by the tutor's review,
  and a lesson waiting for the tutor can't be finished by the child (`lib/playlist-track-actions.ts`).
  A song the student has no `StudentLesson` for yet gets today's one on the first tap
  (`start-today`, as a lesson card does) — and only if `can_do_any_lesson` allows; otherwise
  the buttons for it are hidden. Nothing is drawn as a dialog (the browser shows only the
  fullscreen element): an error, or the 💎 a completion earned, appears in place as a small
  pill. The state shown is the song's entry in the playlist query's cache, which each tap edits,
  so it survives going in and out of fullscreen and is right when the player is reopened. The
  student's playlist (`GET /student-lessons/subjects/{id}/playlist`) therefore carries, per
  track, `lesson_type` and the student's own `student_lesson_id`, `status` and `is_favorite`
  (one extra query for the whole queue; the visitor's playlist has them empty).
* **Loaded a page at a time:** a subject can have hundreds or thousands of
  lessons (a YouTube playlist imported as lessons), so the page never fetches the
  whole list. It asks for the **tabs** first — `GET
  /student-lessons/subjects/{id}/lesson-topics?filter=`, the topics that have
  lessons to show under the filter, each with a count (a few hundred bytes) — and
  then for the open topic's lessons **ten at a time**, `GET
  /student-lessons/subjects/{id}/lessons-page?topic_id=&filter=&limit=10&offset=`,
  fetching the next ten whenever a marker below the grid nears the viewport
  (`components/subjects/use-subject-lessons.ts`, an infinite query). The filter is
  applied by the server (`lessons.services.visible_subject_lessons`), and only a
  page's own lessons get their pictures resolved, so a first paint costs the same
  for a subject of 10 lessons and of 4,000 (measured: 4,081 lessons, 2.9 MB / ~100 ms
  as one list against 7 KB / ~25 ms for a page). Switching tabs or changing the
  filter starts a fresh list.
* **Which lessons show** is chosen with the ⚙️ in the top-right corner (same
  look as the games' settings gear) and kept in a persisted zustand store
  (`preschool-lessons-filter-store.ts`) shared by every subject — see
  `lib/preschool-lessons-filter.ts` for the rules: *available* (default — not
  finished yet), *all* (finished ones too) or *favorites* (hearted on the lesson
  screen, finished or not). Changing it resets the scroll window.

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
