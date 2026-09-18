# Subject Detail & Topic Workspace

Documents what's actually built, as of this writing — the original spec's
3-tab layout (Overview / Recommended Resources / Topics, with a separate
topic detail sub-page) shipped differently: 5 tabs, no dedicated
"Overview" tab, and the topic curriculum is inline rather than requiring
a navigation.

## 1. Routing

* `/subjects/{subjectId}` → `SubjectDetailPage`
  (`components/subjects/subject-detail-page.tsx`), which branches on
  `interfaceMode`: `preschool` renders `PreschoolSubjectDetailPage` (a
  flat grid of big lesson cards, not covered here); everything else
  renders `SimpleSubjectDetailPage` with `colorful` on for Default mode,
  off for Simple mode.
* `/subjects/{subjectId}/topics/{topicId}` → `TopicDetailPage`
  (`components/subjects/topic-detail-page.tsx`) **exists and is fully
  built** (header, progress bar, paginated lesson table) but is currently
  **unreferenced** — nothing in the app links to it. `SimpleSubjectDetailPage`
  renders each topic's lessons inline instead (see §3), so this route is
  reachable only by typing the URL directly.

## 2. Header (not a separate "Overview" tab)

Above the tabs: subject name as `<h1>`, overall completion percent + a
`ProgressBar` (from `GET /academics/{id}/progress` via
`useGetSubjectProgress`), the tutor's name if set, and an
`AttestationTypeBadge` if the subject has one. `subject.description` and
`subject.recommended_resources` (both real `TextField`s on the `Subject`
model) are **not rendered anywhere in the student UI** — fetched by the
API but currently unused on this screen.

## 3. The five tabs (`components/subjects/simple-subject-detail-page.tsx`)

| Tab | Content |
|---|---|
| **Lessons** (default) | A "next lesson" quick-link, then every `Topic` grouped by `SubjectBlock` (`groupTopicsByBlock`), each topic rendered inline as an accordion-like section (`SimpleTopicSection`) listing its lessons with icon, title, status/grade — not a link out to `TopicDetailPage`. Block and topic headings carry scroll-anchor ids (`subjectBlockAnchorId`/`subjectTopicAnchorId`) for deep-linking. |
| **Tasks** | `TasksTabContent` — per-`Topic` `tasks.Task` practice-work items (see `docs/architecture/01-backend-apps.md`'s `tasks` app section), with one overall completed/total progress bar from `GET /tasks/subjects/{id}/progress`. |
| **Plan** | `SemesterPlan` — an expandable list of the subject's `SubjectBlock`s (start/due dates, markdown description), shared verbatim with the tutor's subject detail page. |
| **Materials** | `SubjectMaterials` — tutor-uploaded PDF attachments at the subject level (view/download links only for students; tutors get upload/delete). Also shared with the tutor's subject page. |
| **Cards** | `CardsTabContent` — the student's personal flashcard sets for this subject (`cards` app — see `docs/architecture/01-backend-apps.md`), grouped by topic, reusing the same `Topic`/`Lesson` grouping as the Lessons tab where a card is tied to a real lesson. |

The active tab is persisted in the URL query string (`useTabQueryParam`),
not just component state.

## 4. Lesson rows and status

Each lesson row (`SimpleSubjectLessonRow`) shows a type icon
(colored in Default mode, gray in Simple), title, and — once assigned —
either a `StatusBadge` (Default mode) or a plain status label (Simple
mode). Clicking a lesson navigates to `/lessons/{id}` (the wizard — see
`lesson.md`).

## 5. `TopicDetailPage` (unreferenced, but accurate if reached directly)

Topic name + description, a `ProgressBar` for that topic's completion
percent (`GET /student-lessons/topics/{id}/progress`), and a paginated
table (Lesson / Block / Status / Score columns, prev/next buttons) from
`GET /student-lessons/topics/{id}/lessons`. Matches the original spec's
description closely — it's just not currently wired into the primary
navigation flow.
