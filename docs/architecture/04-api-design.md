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
| POST /subjects/{id}/generate-calendar | Runs calendar generation synchronously, inline in the request (200 OK, not a queued job — see `08-calendar-generation.md`) |
| POST /subjects/{id}/recalculate-calendar | Same, re-run after date/order changes (200 OK) |
| POST /student-lessons/{id}/reschedule | Move a single lesson to a specific date; sets `is_manually_scheduled=True`; delegates the row write to `lessons.services` |

See `08-calendar-generation.md` for the full generation/recalculation algorithm.

## `achievements` — `/api/achievements/*`

The `progress` router shown in older versions of this doc (`GET /subjects/{id}/progress`, `GET /progress/achievements`) was never built — no ledger, no per-subject aggregation endpoint. What exists instead:

| Method & Path | Purpose |
|---|---|
| GET /subjects | Every subject's completion % + its matching `ProgressBadge` tier, for "Мої досягнення" |

Diamond balance itself comes back on `GET /api/auth/me` (`UserOut.diamond_balance`), not a `progress`/`achievements` endpoint — see `docs/core/gamification.md` §2–3.

## `house` — `/api/house/*`

| Method & Path | Purpose |
|---|---|
| GET /furniture | Catalog with per-item ownership/placement state |
| POST /furniture/{id}/purchase | Deduct Diamonds, create `FurniturePurchase` + default-transform `PlacedFurnitureItem` |
| POST /furniture/{id}/place | Place an owned-but-unplaced item |
| PATCH /furniture/{id}/placement | Update position/rotation/scale (drag gizmo) |
| DELETE /furniture/{id}/placement | "Put away" — remove the `PlacedFurnitureItem` row |
| GET /room-style | Current wall/floor color |
| PATCH /room-style | Update wall/floor color |

## `preschool` — `/api/preschool/*`

| Method & Path | Purpose |
|---|---|
| GET /stories | Published stories (public, `auth=None`) |
| GET /stories/{slug} | One published story's content (public) |
| GET /tutor/stories, /tutor/stories/{id} | Tutor's editing list/detail — every story, published or not |
| POST /tutor/stories | Create a new (unpublished) story |
| POST /tutor/stories/import | Import a story from an uploaded ZIP (matching the static `story.md` bundle format) |
| PATCH /tutor/stories/{id} | Edit title/content/publish state |
| DELETE /tutor/stories/{id} | Delete a story (and its assets) |
| GET /tutor/stories/{id}/export | Export as a ZIP |
| POST/DELETE /tutor/stories/{id}/assets... | Upload/remove an embedded image/audio/video asset |

## `tasks` — `/api/tasks/*`

| Method & Path | Purpose |
|---|---|
| GET /subjects/{id} | List Tasks across a subject's topics |
| GET /tasks/{id} | One Task's detail |
| POST /tasks/{id}/submission | Submit/overwrite a free-text/file answer |
| POST /tasks | Create a Task (tutor) |
| PATCH /tasks/{id} | Edit a Task (tutor) |
| DELETE /tasks/{id} | Delete a Task (tutor) |
| POST /tasks/{id}/complete | Mark done |
| DELETE /tasks/{id}/complete | Un-mark done |

## `cards` — `/api/cards/*`

| Method & Path | Purpose |
|---|---|
| POST / | Add one flashcard |
| POST /import | Bulk-import a `set.json` deck |
| PATCH /{id} | Update a card's translation/definition |
| GET /groups | List the Group (Subject) level of the student's card tree |
| GET /groups/{id}/sets, /sets/{id} | Set (Topic) / card-list drill-down |
| DELETE /{id} | Delete a card |

## `dictionary` — `/api/dictionary/*`

| Method & Path | Purpose |
|---|---|
| GET / | List the student's saved dictionary items |
| POST / | Save a 1–5 word selection (with source sentence) |
| PATCH /{id} | Update translation or status (new/in_progress/known) |
| DELETE /{id} | Remove an item |

## `tts` — `/api/tts/*`

| Method & Path | Purpose |
|---|---|
| GET /voices | `(language, profile) -> voice_id` map for the frontend's client-side Piper TTS |

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
