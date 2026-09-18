# Lesson Lifecycle and Statuses

Documents what's actually built, as of this writing (same convention as
`docs/core/progress.md`/`gamification.md`) — see
`docs/architecture/03-lesson-lifecycle.md` for the technical-design
counterpart of this doc.

## 1. Core domain split

- **`Lesson`** (template) — static content: `lesson_type`
  (`with_quiz` / `theory` / `with_task`), `grading_type` (`points` 1–12 /
  `binary` Pass–Fail), Markdown `content`, quiz questions/choices, task
  attachments. Owned by `lessons` (`backend/lessons/models.py`).
- **`StudentLesson`** (per-student instance) — the dynamic execution state:
  `status`, `scheduled_date`, `started_at`/`completed_at`, `attempt_count`,
  `quiz_score_percent`, `grade_points`/`grade_result`, `tutor_feedback`.
  Every write to this table goes through `lessons.services`
  (`backend/lessons/services.py`), regardless of which app's endpoint
  triggers it — see `docs/architecture/01-backend-apps.md`.

## 2. Status machine

`StudentLessonStatus` (`backend/lessons/models.py`) has exactly six values
— there is no `Failed` status (an earlier draft of this doc floated one;
`docs/architecture/07-open-questions.md` resolved the contradiction: a
failed quiz attempt just stays `In Progress`):

| Status | Meaning | Entered from | `lessons.services` function |
|---|---|---|---|
| `Assigned` | Scheduled but not yet opened. Default on creation. | — | — |
| `In Progress` | Student has opened the lesson and is actively working on it. | `Assigned` (auto, on first open), `Need Help` (resolved back), `Revision Required`→`Pending Review` doesn't return here | `start` / `ensure_started` |
| `Need Help` | Student flagged they're stuck. | `In Progress` | `request_help` |
| `Pending Review` | A file/comment submission is in, locked from further student edits. | `In Progress` (submit), `Revision Required` (resubmit) | `submit_task` / `resubmit` |
| `Revision Required` | Tutor found issues in a Pending Review submission and sent it back with feedback. | `Pending Review` | `request_revision` |
| `Completed` | Final state — graded/passed, diamonds awarded, percent-complete caches refreshed. | `In Progress` (quiz pass, "understood"), `Pending Review` (tutor grades it), `Need Help` (tutor resolves to Completed) | `mark_completed` (see §5) |

`GET /{student_lesson_id}` auto-transitions `Assigned` → `In Progress` on
first open (`ensure_started`, called from the detail endpoint) — there is
no explicit "Start Lesson" action in the API; the wizard's first "Go to
task" step just opens the lesson.

## 3. The three completion paths

Which path applies is fixed per-lesson by `Lesson.lesson_type`.

### Path A — `with_quiz` (auto-graded)

`POST /{id}/submit-quiz` → `lessons.services.submit_quiz`. Score is the
percentage of `QuizQuestion`s answered with the correct `QuizChoice`.

- **Score > 60%** (`QUIZ_PASS_THRESHOLD_PERCENT`) → `mark_completed`, with
  `grade_points` set via a linear 0–100%→1–12 mapping
  (`_score_to_grade_points` — clamped to 1–12; no exact formula is
  specified anywhere upstream, so this is a reasonable-default
  implementation choice, not a confirmed product rule).
- **Score ≤ 60%** → status stays `In Progress`; `attempt_count` is
  incremented either way. The student can retake the quiz or call
  `request_help`.
- `GET /quiz-questions/{id}/hint` resolves the correct choice on demand
  (used by the preschool quiz's raccoon-mascot hint, see
  `docs/views/preschool/README.md` §4) — `is_correct` is never included in
  the quiz payload itself.

### Path B — `theory` (self-assessment)

`POST /{id}/confirm-understanding` → `lessons.services.confirm_understanding`.

- **`understood: true`** → `mark_completed` with `grade_result=Pass`.
- **`understood: false`** → transitions to `Need Help` directly (no retry
  loop — this path has no quiz to retake).

### Path C — `with_task` (manual submission)

`POST /{id}/submit-task` → `lessons.services.submit_task`. Uploads files
and an optional comment, creates a `LessonSubmission`, transitions to
`Pending Review`. No auto-grading — see §4 for what happens next.

## 4. Tutor review (Pending Review / Revision Required)

Only Path C submissions land here (plus any `Need Help` case a tutor
resolves manually — see §5).

- **`grade_submission`** (tutor grades a Pending Review submission) →
  `mark_completed`, with optional `feedback` text attached to the latest
  `LessonSubmission` (`_attach_feedback_to_latest_submission`).
- **`request_revision`** → `Pending Review` → `Revision Required`, feedback
  attached the same way.
- **`resubmit`** (`POST /{id}/resubmit`) — student resubmits from
  `Revision Required`: the previous submission's `is_latest` flag is
  cleared, a new `LessonSubmission` is created, status returns to
  `Pending Review`. This can loop indefinitely (revision → resubmit →
  revision → ...).

## 5. Need Help

- **`request_help`** (`POST /{id}/request-help`, from `In Progress`) —
  sets `help_note`, transitions to `Need Help`, and posts a
  `LessonComment` with `kind=help_request` (visually distinguished from a
  general comment in the tutor's feed — see
  `docs/interfaces/tutor/main.md`).
- **Tutor resolution** — `resolve_need_help` (via `tutoring`'s dashboard,
  see `docs/architecture/01-backend-apps.md`), which can transition either:
  - **back to `In Progress`** — marks the originating `help_request`
    comment resolved and threads the tutor's reply under it; or
  - **to `Completed`** — same `mark_completed` path as any other
    completion, with `feedback` attached as `tutor_feedback` if given.
- **Student self-resolution** — `POST /{id}/resolve-need-help` →
  `resolve_own_need_help`: the student can mark their own question
  resolved (e.g. they figured it out on their own) without tutor
  involvement. Transitions `Need Help` → `In Progress` and threads a fixed
  "Учень сам розібрався" ("Student figured it out") reply under the
  originating comment.

## 6. Comments

`LessonComment` (`kind`: `general` | `help_request`) — a persistent thread
on the `StudentLesson`, visible to the owning student and any tutor scoped
to the lesson's subject. `POST /{id}/comments` (`add_comment`) never
mutates `status` — only the dedicated action endpoints above do. A
`help_request` comment additionally carries `is_resolved`/`resolved_at`,
set by whichever resolution path (tutor or self) closes it.

## 7. Diamonds and progress caches

Every path through `mark_completed` awards diamonds (see
`docs/core/progress.md` §2 for the full formula — lesson/topic/semester
bonuses) and refreshes `StudentProfile.completed_lessons_percent_cache`
(recomputed from scratch each time, since the denominator — total lessons
in the student's class — can itself change). This doc intentionally
doesn't repeat that detail; see `progress.md` for it.
