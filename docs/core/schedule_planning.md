# Academic Dates and Schedule Planning

Documents what's actually built, as of this writing (same convention as
`docs/core/progress.md`/`gamification.md`). See
`docs/architecture/08-calendar-generation.md` for the technical-design
counterpart.

## 1. Subject scheduling fields

`Subject.start_date`/`due_date` (`backend/academics/models.py`):

- **`start_date`** — defaults to September 1 of the class's academic year
  (`default_subject_start_date`); tutor/admin can override it any time.
- **`due_date`** — defaults to `start_date` + 9 months
  (`default_subject_due_date`); fully tutor-editable, no restrictions.
- **Guardrail**: `Subject.clean()` enforces `start_date < due_date` on
  every save.

## 2. Topic ordering

`Topic.order_index` is tutor-editable via `PATCH
/tutor/subjects/{id}/topics/reorder` (drag-and-drop in the UI). Whatever
`order_index` currently holds is what the next generation or recalculation
run reads — there's no separate "planned" vs. "applied" order.

## 3. Per-subject calendar generation

Nothing runs on a schedule or on save — generation only happens when a
tutor/admin explicitly triggers it.

- **`POST /schedule/subjects/{id}/generate-calendar`** and
  **`POST /schedule/subjects/{id}/recalculate-calendar`** — both call the
  exact same function, `scheduling.services.generate_calendar_for_subject`
  ("recalculate" is not a separate code path; it's the same idempotent
  generation re-run). Runs **synchronously**, inline in the request — not
  via a background `django-q` task.
- **Algorithm**: re-syncs each `Topic`'s `SubjectBlock` assignment first
  (`academics.services.assign_topics_to_blocks`), then takes every
  `Lesson` across the subject's `Topic`s in `order_index` order, splits
  them evenly (`_split_evenly` — remainder to the front groups, same rule
  `docs/core/data.md` describes for subject blocks) across the weeks
  spanning `[start_date, due_date]`, and lays each week's lessons across
  that week's weekdays (Mon–Fri). For every student enrolled in the
  subject's class, each `Lesson` gets a `StudentLesson` synced to the
  computed date via `lessons.services.sync_scheduled_lesson`.
- **Never overwritten**: `sync_scheduled_lesson` silently skips any
  existing `StudentLesson` that's already `Completed` or
  `is_manually_scheduled` — completed history and deliberate tutor
  overrides survive every recalculation.

## 4. Manual single-lesson reschedule

**`POST /schedule/student-lessons/{id}/reschedule`** (tutor, scoped to
lessons in their own subjects) sets `scheduled_date` directly via
`lessons.services.reschedule` and flags `is_manually_scheduled = True`,
taking that lesson out of scope for future per-subject generation runs
(§3) — but *not* out of scope for a full class-level reflow (§5), which
treats a manually-scheduled-but-incomplete lesson as fair game.

## 5. Class-level "Plan Lessons" (multi-subject reflow)

A second, more flexible planning tool: **`POST
/schedule/classes/{id}/generate-schedule`**
(`scheduling.services.generate_class_schedule`) — the tutor's "Plan
Lessons" modal on the class detail page. Given a date range and, per
subject, a target lesson count, it:

1. Gathers each subject's not-yet-completed `StudentLesson`s already
   scheduled on/after the range's start date, plus enough new
   not-yet-assigned lessons to hit the requested count.
2. Ranks each eligible school day (Mon–Fri only) by current load — fewest
   lessons first, then days that don't already carry that subject, then
   earliest date — and hands out even-sized chunks of that subject's
   lessons to the least-loaded days first, in curriculum order.
3. Writes every affected `StudentLesson` for every student in the class in
   one pass, clearing `is_manually_scheduled` on any row it touches (a
   full reflow always wins over an earlier manual override — completion is
   the only hard stop here, same as §3).

An optional per-subject **`randomize`** flag ("Рендомні уроки" in the UI)
skips curriculum ordering entirely for that subject: new lessons are a
random sample instead of the next ones by `order_index`, and the merged
batch is shuffled rather than re-sorted before being handed to days.

## 6. Backlog and "today"

`scheduling.services.get_backlog`/`get_today` are pure read queries —
backlog is computed at query time from `scheduled_date < today AND status
!= Completed`, never persisted as its own state.
