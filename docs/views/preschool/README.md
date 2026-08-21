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
  `/auth/me` via `mapApiUserToAuthUser` (`frontend/lib/api/map-user.ts`).

Every shared route has a thin client-component wrapper that branches on
`interfaceMode` and renders either the existing (`default`) UI or a
`Preschool*` component. None of the three duplicate any data-fetching logic
they don't need to — they mostly reuse the same Orval hooks as the default
views.

| Route | Wrapper | Default component | Preschool component |
|---|---|---|---|
| `/` | `frontend/components/student-dashboard.tsx` | inline list | `PreschoolGameMap` / `BalloonPopGame` |
| `/calendar` | `frontend/components/calendar/student-calendar-view.tsx` | `WeeklyCalendar` | `PreschoolCalendar` |
| `/lessons/[id]` | `frontend/components/lesson-wizard/student-lesson-view.tsx` | `LessonWizard` | `PreschoolLessonView` |

All preschool-specific components live under `frontend/components/preschool/`.

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

### Balloon Pop celebration

Component: `balloon-pop-game.tsx` → `BalloonPopGame`. Trigger, computed in
`student-dashboard.tsx`:

```
hasAnyItems && backlog.length === 0 && today.every(item => item.status === "completed")
```

i.e. not just today's lessons — every tail has to be cleared too, and there
has to be at least one item (an empty day never celebrates).

* Balloons spawn on an interval, drift down, and pop on tap with a
  particle burst and a procedural Web-Audio "pop" (no audio asset pipeline
  exists in this project, so sounds here and in the lesson view are
  synthesized, not files).
* A ruby-icon + red-circle counter tracks the session's pop count (no
  server round-trip — purely client-side).

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
