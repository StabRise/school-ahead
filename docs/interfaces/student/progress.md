# Subject Progress

Documents what's actually built, as of this writing — there is **no
dedicated "Subject Progress" screen**. The original spec (a one-click
screen with average grade, a per-subject diamond balance, and
semester-by-semester tabs with their own diamond totals) was never built;
progress is instead surfaced inline in a few existing places, and two of
the spec's core metrics don't exist in the data model at all.

## 1. What's actually shown, and where

* **Overall completion %** — a `ProgressBar` + percent in the Subject
  Detail Page header (`GET /academics/{id}/progress`, see `subjects.md`
  §2) and in the dashboard/`/subjects` row lists (`subjects_list.md`).
* **Per-topic completion %** — on `TopicDetailPage` (`subjects.md` §5),
  currently unreferenced from the main navigation.
* **Working-ahead highlighting and diamonds earned per lesson** — not on
  a subject screen at all; this lives on the Calendar (`calendar.md`) and
  is documented in full in `docs/core/progress.md` §1-2.

## 2. What the spec described that isn't built

* **Average grade** — no aggregate average-grade field or computation
  exists anywhere in the backend (`backend/lessons/`,
  `backend/academics/`) or frontend. Only per-lesson scores
  (`ScoreBadge`, grade 1-12 or Pass) exist.
* **Per-subject diamond balance** — diamonds are a single global counter
  (`StudentProfile.diamond_balance_cache`), not broken down per subject or
  per semester. `docs/core/progress.md`'s gap note already flags this
  explicitly: "no per-subject/per-block diamond breakdown."
* **Semester tabs with their own stats** — the closest built equivalent is
  the Subject Detail Page's "Plan" tab (`SemesterPlan`), which lists each
  `SubjectBlock`'s dates and description, not per-block progress/grade/
  diamond stats.

`achievements.ProgressBadge` (see `docs/architecture/01-backend-apps.md`
and `docs/core/gamification.md` §5) is the one real "gamified subject
progress" feature that does exist — a completion-percent-tiered badge per
subject, shown wherever `SubjectProgressList` renders — but it's a badge
tier, not the grade/diamond dashboard this doc originally specified.
