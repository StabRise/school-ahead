# API Design

Django Ninja router breakdown per app. Endpoint tables list method, path, and purpose — not full request/response schemas.

## Conventions

- **Pagination**: Ninja `LimitOffsetPagination` on list endpoints, default page size 20–50, with a `Query` schema per endpoint for filters.
- **Auth**: a custom `CookieOrBearerJWTAuth` auth class (backed by `django-ninja-jwt` token validation) attached per-router. It accepts the JWT from either source and resolves both to the same `request.auth = User`: the httpOnly `access_token` cookie (browser calls via the Orval client, `credentials: include`) or an `Authorization: Bearer` header (Next.js server calls — Server Components/Route Handlers/Server Actions — reusing the same token read out of that cookie server-side). Mutating requests (`POST`/`PATCH`/`DELETE`) additionally require an `X-CSRF-Token` header matching the `csrf_token` cookie, but **only when the request authenticated via the cookie** — Bearer-authenticated requests are exempt, since CSRF requires a browser to auto-attach credentials, which never happens with a Bearer header (double-submit pattern and the server-call path — see `05-auth-flow.md`).
- **Tutor-scope enforcement is queryset-level**, via a shared `get_tutor_subject_ids(user) -> QuerySet[int]` helper in `tutoring`'s service layer, applied as `.filter(lesson__topic__subject_id__in=allowed_subject_ids)` before pagination/serialization. It is never enforced only by hiding fields in the response schema — that would leave an IDOR hole.
- **CORS**: `django-cors-headers` with `CORS_ALLOWED_ORIGINS = [FRONTEND_ORIGIN]` and `CORS_ALLOW_CREDENTIALS = True`, required for the browser to send/receive the auth cookies on direct cross-origin calls to Django (see `05-auth-flow.md`).

## `accounts` — `/api/auth/*`

| Method & Path | Purpose |
|---|---|
| POST /google | Verify Google ID token, `get_or_create` User + SocialAccount, issue JWT pair |
| POST /refresh | Rotate refresh token, issue new access+refresh pair |
| POST /logout | Revoke the refresh-token row |
| GET /me | Return current user + role + profile summary |

## `academics` — `/api/academics/*`

| Method & Path | Purpose |
|---|---|
| GET /classes | List classes (school-scoped) |
| GET /classes/{id}/subjects | List subjects for a class |
| GET /subjects/{id} | Subject detail, incl. blocks, start_date/due_date |
| GET /subjects/{id}/topics | List topics + nested lesson count |
| PATCH /subjects/{id} | Edit start_date/due_date, block_count (admin/tutor) |
| PATCH /subjects/{id}/topics/reorder | Bulk `order_index` update (admin/tutor) |
| POST/PUT/DELETE /... | Admin-only CRUD for School/Class/Subject/Topic (staff permission) |

Calendar generation triggers live in `scheduling`, not here (see below).

## `lessons` — `/api/student-lessons/*`

| Method & Path | Purpose |
|---|---|
| GET /{id} | Wizard detail: content pages, assignment step config, current status |
| POST /{id}/start | Assigned → InProgress |
| POST /{id}/submit-quiz | `with_quiz`: submit answers → auto-grade → Completed/NeedHelp |
| POST /{id}/confirm-understanding | `theory`: yes/no → Completed/NeedHelp |
| POST /{id}/submit-task | `with_task`: upload file(s) → PendingReview |
| POST /{id}/request-help | → NeedHelp (with note) |
| POST /{id}/resubmit | RevisionRequired → PendingReview (comment + new file) |

Reschedule lives in `scheduling`, not here, though it still calls `lessons.services` to perform the write.

## `scheduling` — `/api/schedule/*` (no models — read AND write)

| Method & Path | Purpose |
|---|---|
| GET /calendar?week_start=YYYY-MM-DD | Mon–Sun grid of `StudentLesson` for the student |
| GET /today?date=YYYY-MM-DD | Numbered daily list + Backlog section beneath |
| GET /backlog | Flat overdue-incomplete list, labeled with origin weekday + ordinal |
| POST /subjects/{id}/generate-calendar | Enqueue a `django-q` task that generates the calendar (202 Accepted) |
| POST /subjects/{id}/recalculate-calendar | Same, re-run after date/order changes (202 Accepted) |
| POST /student-lessons/{id}/reschedule | Move a single lesson to a specific date; sets `is_manually_scheduled=True`; delegates the row write to `lessons.services` |

See `08-calendar-generation.md` for the full generation/recalculation algorithm.

## `progress` — `/api/subjects/*`, `/api/progress/*`

| Method & Path | Purpose |
|---|---|
| GET /subjects/{id}/progress | Completion %, avg grade, diamond balance, per-block breakdown |
| GET /progress/achievements | Student's earned achievements/badges |

## `tutoring` — `/api/tutor/*`

| Method & Path | Purpose |
|---|---|
| GET /assignments | Tutor's own assigned subjects (for filter dropdowns) |
| GET /need-help?subject=&class= | Need-Help feed, scoped to assigned subjects |
| GET /pending-review?subject=&class= | Pending-review queue, scoped, filterable |
| GET /submissions/{student_lesson_id} | Submission detail (files/answers) |
| POST /submissions/{student_lesson_id}/grade | Grade + feedback → Completed (delegates to `lessons` service) |
| POST /submissions/{student_lesson_id}/request-revision | → RevisionRequired with feedback |
| POST /need-help/{student_lesson_id}/resolve | → InProgress or Completed |

### Real-time delivery note

The Need-Help feed is documented as needing "real-time" delivery, but no push mechanism is specified. MVP: React Query polling (`refetchInterval`, ~15–30s) against `GET /api/tutor/need-help`. Django Channels/SSE/WebSockets is flagged as a future upgrade in `07-open-questions.md`, not built now.

---
[← Back to Overview](00-overview.md)
