# Public Access — browsing without signing in

A class can be opened to visitors who aren't signed in. They see the same
preschool-style bookshelf, subject page and lesson screen a student sees, but
read-only: a lesson's content and nothing that belongs to a student.

## 1. The switch

`Class.is_public` (boolean, default `False`). Set from the Django admin (the
class list has the column and a filter); there is no tutor-facing form. It is
deliberately **not** on `ClassIn` — `PUT /academics/classes/{id}` copies every
field of that schema onto the class, so an omitted flag would silently switch a
public class back to private.

A subject or lesson is public exactly when its class is. Turning the flag off
hides everything at once.

## 2. What a visitor can do

| | Signed out | Student |
|---|---|---|
| Bookshelf `/subjects` | every subject of every public class that has a lesson, category filter, a ⚙️ with two views (marked by a tutor — the default — or all), **no progress bar** | own class, progress per book, a ⚙️ with three views (adds favourites) |
| Subject `/subjects/{id}` | one card grid, a tab per topic; **no points, progress or lesson filter** | same, with progress, points and the ⚙️ filter |
| Lesson `/lessons/preview/{id}` | the title over the framed video/text, and a "sign in to do the assignment" button | the lesson wizard, with `/lessons/{studentLessonId}` |
| Practice step (quiz, task, "did you understand?") | ✗ | ✓ |
| Favourite ♥, "something's wrong" ⚠️, comments, notes, read-along | ✗ (not shown) | ✓ |
| Diamonds, streaks, calendar, avatar | ✗ | ✓ |

The design is reused, not copied: `PreschoolSubjectsShelf` /
`PreschoolPublicSubjectsShelf` share one shelf layout;
`PreschoolSubjectDetailPage` / `PreschoolPublicSubjectDetailPage` share
`PreschoolSubjectScreen` (a `guest` flag drops what needs a student); the public
lesson view is built from `PreschoolLessonScene`, `ExitButton` and `MagicScreen`
of the student's `PreschoolLessonView`.

## 3. Backend

`academics/public_api.py`, mounted at `/api/public`, `auth=None`. An explicit
allowlist — the authenticated routers stay exactly as they were (they still
`401` a visitor whatever the class flag says; a test asserts it).

| Endpoint | Returns |
|---|---|
| `GET /public/subjects` | `PublicSubjectOut[]` — public classes only, subjects with ≥1 lesson, ordered by class, then `order_index`; carries `is_marked` for the shelf's default view |
| `GET /public/subjects/{id}` | `PublicSubjectOut` |
| `GET /public/subjects/{id}/topics` | `TopicOut[]` |
| `GET /public/subjects/{id}/lessons` | `SubjectLessonOut[]`, every `student_*` field null |
| `GET /public/subjects/{id}/playlist?topic_id=` | `PlaylistTrackOut[]` — the songs of one topic for the ▶ player: one track (`lesson_id`, `title`, `video_id`, `lesson_type`) per lesson with a YouTube link, in lesson order; the student-only fields (`student_lesson_id`, `status`, `is_favorite`) are empty |
| `GET /public/subjects/{id}/lesson-topics` | `LessonTopicOut[]` — the subject page's tabs: the topics that have lessons, each with a count |
| `GET /public/subjects/{id}/lessons-page?topic_id=&limit=&offset=` | `SubjectLessonPageOut` — one topic's lessons `limit` (default 10) at a time, with the total; what the subject page loads as the visitor scrolls |
| `GET /public/lessons/{id}` | `LessonPreviewOut` (content, task text, attachments), `student_lesson_id` null |
| `GET /academics/subject-groups` | now also public (`auth=None`) — global reference data the shelf's category filter needs |

* Every lookup goes through one query (`_public_subjects()`); a subject or
  lesson of a private class returns **404**, the same as an id that doesn't
  exist, so the API doesn't reveal which private ones exist.
* `PublicSubjectOut` is `id`, `name`, `icon`, `group_id` and `is_marked` only. It is not
  `SubjectOut`: that carries `teacher_name`, which falls back to the tutor's
  **e-mail address**.
* The list/lesson payloads are built by the same functions the student
  endpoints use (`lessons.api.subject_lessons_out`, `lesson_preview_out`), so a
  visitor sees exactly the fields a student would, minus their own rows.

## 4. Frontend

* **Routes.** `lib/public-paths.ts` lists what the middleware lets through
  without the `access_token` cookie: `/subjects`, `/subjects/{digits}` and
  `/lessons/preview/{digits}` as exact patterns (a topic page or a student's own
  `/lessons/{id}` still redirect to `/login`), next to `/login` and `/games/*`.
  The middleware only checks the cookie is *present*; what a visitor can
  actually read is decided by the API.
* **Who is a visitor.** `useAuthStore` has `isResolved` — false until
  `GET /auth/me` has answered — and `useIsGuest()` is `isResolved && !user`.
  The three route components render nothing until it is resolved, so a
  signed-in student never flashes the public screens (or fires their requests).
  `/auth/me` is not retried on a `401` (`shouldRetryMe`): the default three
  retries with backoff would have delayed "you're signed out" by ~7 s.
* **Header and home page.** A signed-out visitor's header has "Предмети
  (демо, дошкільнята)" (the note only from `md` up), "Казки" and "Ігри" next to the
  brand (all hidden below the `sm` breakpoint) and an "Увійти через Google" button.
  The home page (`/uk`) is the landing page (`components/landing/landing-page.tsx`): a
  hero with an "Увійти через Google" button and a "Дізнатися більше" one (→ `/about`,
  below), then three cards — subjects (also marked "(демо, дошкільнята)"; `/subjects`),
  fairy tales (`/games/stories`) and games (`/games`). Its art is in
  `public/images/landing/`.
* **Sign-in buttons go straight to Google.** Every "Увійти через Google" button (header,
  landing, `/about`) is a `GoogleSignInButton` (`components/google-sign-in-button.tsx`):
  one click opens Google's account chooser — there is no stop at `/login`. Google only
  gives a page an ID token through the button it draws itself, so that button is laid
  over ours, stretched to its size and nearly transparent. Until the Google script has
  loaded (or if it can't, or `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is unset) the button is an
  ordinary link to `/login`. The credential handling (`POST /auth/google`, the auth
  store, then `/`) and the once-per-page Google initialisation are shared with the
  `/login` page in `lib/google-sign-in.ts`.
* **"Дізнатися більше" — `/about`** (`components/landing/about-page.tsx`, an exact
  public pattern in `lib/public-paths.ts`). Explains the platform to a visitor: working
  ahead and diamonds, the two interface modes (the preschool mode for the middle and
  senior kindergarten groups, and the school student mode, with two screenshots in
  `public/images/landing/`), the nine preschool minigames (covers from
  `public/static/*/cover*.jpeg`, each linking to its `/games/...` route) and the note
  that what a visitor can open — the subjects and the games — is the preschool mode.
  Copy is in the `About` namespace of `messages/uk.json`.
* **Lessons open, or play fullscreen.** The bookshelf's ⚙️ (visitors have it too) also
  chooses what tapping a lesson on a subject page does — and a subject page's own ⚙️ (a
  visitor's holds only this) can override it for that subject: *open the lesson* (the preview,
  as before) or *play the video fullscreen* in the subject page's ▶ player, from that
  lesson on — see `docs/views/preschool/README.md` (Bookshelf, Subject page). A visitor
  gets no ✅ or ❤️ in the player: they have no `StudentLesson`.
* **No site header on the catalogue itself.** On `/subjects` and `/subjects/<id>` a
  visitor sees the preschool-style page and no classic header (`Header` renders
  nothing there — `isPublicCataloguePage` in `lib/preschool-chrome.ts`). What is left
  is a 🏠 preschool button: on the bookshelf, fixed in the top-left corner, to the
  root (`/`) (`PreschoolChrome`); on a subject page, the 🏠 in the top row of the
  card, back to the bookshelf (`/subjects`) — as it is for a student — so the way home
  from a subject is subject → shelf → root. Everything else they can open (the home
  page, the games, the login) keeps the header.
* A signed-in user who opens `/lessons/preview/{id}` gets the student preview
  as before (`403` unless `can_do_any_lesson`); only visitors use the public one.

## 5. Not covered

* A signed-in student browsing a public class **other than their own** — the
  shelf and subject page keep their per-class behaviour.
* Lesson attachments (`LessonPreviewOut.materials`) are returned but the
  preschool lesson screen, student or visitor, doesn't draw them.
* No rate limiting or caching on `/api/public/*`.
