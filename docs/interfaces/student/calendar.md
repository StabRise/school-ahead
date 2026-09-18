# Weekly Calendar

Documents what's actually built, as of this writing — the shipped screen
diverges from the original spec in two ways: it's not fixed to a
Monday-Sunday week (a period switcher), and there's no dedicated "Backlog
Block" panel here (overdue lessons stay on their own original date column
instead — see `today.md` for where a merged backlog view actually lives).

## 1. Where it lives

`/calendar` → `StudentCalendarView`
(`components/calendar/student-calendar-view.tsx`) → `SimpleCalendar`
(`components/calendar/simple-calendar.tsx`, `colorful` on outside Simple
mode; preschool mode gets its own `PreschoolCalendar` — see
`docs/views/preschool/README.md` §3). The same `SimpleCalendar` component
also renders inside the tutor's per-student overview page (`studentId`
prop switches it to `GET /tutor/students/{id}/calendar` and makes lessons
drag-to-reschedule/deletable instead of just clickable).

## 2. Header controls

* **Period switcher** — 4 days / a week (7, default) / 10 days
  (`PeriodSwitcher`), not a fixed weekly grid. The 7-day period stays
  Monday-aligned; 4- and 10-day periods are a rolling window starting from
  today.
* **Navigation** — previous/next (shifts the range by the period length)
  and a "today" jump back to `defaultRangeStart`.
* **Progress summary** — an "X/Y completed" bar for the visible range
  (`useGetWeeklyProgress`-style aggregation inline in the component).
* **Lesson filter switcher** — all lessons vs. not-completed-only,
  narrowing what renders per day column.

## 3. Grid and lesson placement

One column per day in the active range. A lesson renders **only on its own
`scheduled_date` column** — an overdue lesson is not moved into today's
column; it stays on the day it was due, styled in dark red, so browsing
back to an earlier range is how a student re-surfaces it. Each card shows
subject/lesson title, a type icon, and a `StatusBadge` (Default mode) or
plain label (Simple mode); clicking opens `/lessons/{id}` and (if the
lesson was `Assigned`) the backend transitions it to `In Progress`.

## 4. Tutor-only affordances (shared component)

When `studentId` is set (tutor viewing a student), the same grid gains
drag-and-drop rescheduling (`RescheduleDialog`), an "add lesson to this
day" action (`AddDayLessonDialog`), and per-lesson delete — none of which
render for a student viewing their own calendar.
