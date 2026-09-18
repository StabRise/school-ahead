# Student's Daily View ("Today")

Documents what's actually built, as of this writing — there's no separate
`/today` or `/day` route; this is the `/` root itself, and the original
spec's "Backlog Section positioned directly beneath the main schedule" is
now one merged table rather than two visually separate blocks.

## 1. Where it lives

`/` → `StudentDashboard` (`components/student-dashboard.tsx`), fed by a
single `GET /schedule/today?date=<today>` call (`useGetToday`), which
returns `{ today, backlog }` separately. What renders depends on
`interfaceMode`:

* **Preschool** — `PreschoolGameMap`, an adventure-road path through
  `[...backlog, ...today]` as one continuous sequence (see
  `docs/views/preschool/README.md` §2), not covered further here.
* **Default / Simple** — `SimpleDashboard`
  (`components/simple-dashboard.tsx`), covered below. `colorful` (Default)
  restores colored status badges, dark-red overdue dates, and gradient
  progress bars; Simple keeps everything monochrome.

## 2. `SimpleDashboard` structure

* **One merged lesson table**, not two sections: `mergeSimpleRows(lessons,
  backlog)` (`components/simple-lesson-table.tsx`) combines today's
  schedule and the backlog into a single `SimpleLessonTable`, sorted
  together (`sortLessonItems`). A backlog row carries an `origin_label`
  (its original `scheduled_date`, e.g. the "Mon #4" idea from the original
  spec) — `SimpleLessonTable` falls back to `scheduled_date` for rows that
  don't have one, so origin is still visually distinguishable per row
  without a separate panel.
* **`SimpleWeeklyProgress`** — a collapsible weekly completion summary
  (`useGetWeeklyProgress`) above the table.
* **`SubjectProgressList`** — the "Прогрес по предметах" sidebar list
  documented in `subjects_list.md` §1, on the same screen.

## 3. Status indicators

Row styling comes from `resolveStatusLabel`/`StatusBadge` (colored in
Default mode, plain text in Simple mode) — the same status-badge
vocabulary used on the Calendar (`calendar.md`) and Subject Detail Page
(`subjects.md`), not a distinct "blue = completed" scheme specific to this
screen.
