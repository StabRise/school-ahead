# Student Progress & "Ahead" Mode

## 1. Navigation Freedom (Working Ahead)
* **Open Topic Access:** Students are not bound by rigid "one day, one lesson" restrictions. If a student wants to complete Thursday's lessons—or even work ahead to next Wednesday—the system fully supports it.
* **Dynamic Calendar:** Lessons completed ahead of schedule immediately transition to the *Completed* (or *Pending Review*) status.
* **Visual Highlights:** Tasks completed earlier than planned (e.g., finishing a Thursday lesson on Monday) are highlighted in a distinct accent color (such as light purple or bright yellow) to set them apart from regular tasks completed on their scheduled day.
* **Achievement Icons:** A small visual anchor (such as a star ⭐) appears next to such tasks to reinforce the positive habit of working ahead.
* **Calendar Logic:** When the actual scheduled day arrives (e.g., Thursday), the student sees that the lesson is already marked as *Completed* and highlighted as "Completed Ahead". This eliminates daily workload stress and pressure.
* **Core Impact:** This completely breaks traditional school routine fatigue, teaching children valuable self-organization and forward-planning skills.

## 2. Diamond Rewards

Documents what's actually built, as of this writing — see the gap note at the end for how this differs from the ledger-based design `docs/architecture/02-data-model.md` (decision 3) and `01-backend-apps.md` originally specced.

* **Trigger:** every path that transitions a `StudentLesson` to `Completed` — auto-graded quiz pass, theory "understood" confirmation, a tutor grading a Pending Review submission, or a tutor resolving a Need Help request to Completed. All four route through the single `lessons.services.mark_completed`, which is where the award happens (`_award_completion_diamonds`), so no completion path can skip it.
* **Amount:**
  * **+1 diamond** — completed on or after the lesson's `scheduled_date` (a normal or "backlog" catch-up completion).
  * **+2 diamonds** — completed strictly before `scheduled_date`, i.e. the same "ahead of schedule" condition section 1 above describes and `CalendarItemOut.is_completed_ahead` (`scheduling/api.py`) already flags for the calendar UI's visual highlight.
* **Storage:** `StudentProfile.diamond_balance_cache`, incremented with an atomic `F()` update (safe under concurrent completions for the same student).
* **Display:** the app header shows a 💎 badge with the current balance next to the student's avatar, sourced from `UserOut.diamond_balance` (`GET /auth/me`) — `role=student` only, `null` for every other role.

**Gap vs. the originally-planned design:** `docs/architecture/02-data-model.md` and `01-backend-apps.md` describe diamonds as an append-only ledger (`progress.DiamondLedgerEntry`), with `diamond_balance_cache` existing only as a perf-optimization cache refreshed from that ledger. The `progress` app doesn't exist yet — this pass writes directly to the cache field as a plain running counter instead. That means: no per-award audit trail, no support for correction entries (e.g. a tutor downgrading a grade after diamonds were already awarded doesn't claw them back), and no per-subject/per-block diamond breakdown. Working-ahead bonuses beyond a single lesson and semester-closure bonuses (`docs/architecture/07-open-questions.md`) remain unimplemented.