# "My Subjects" — Student Dashboard & Subjects List

Documents what's actually built, as of this writing — the original spec
(a responsive grid of shadowed subject cards, one per breakpoint) was never
built that way; the shipped UI is a dense sortable row-list, shared between
the dashboard sidebar and the full `/subjects` page.

## 1. Two places this renders

* **Dashboard sidebar — "Прогрес по предметах":** `SubjectProgressList`
  (`components/subject-progress-list.tsx`), rendered inside
  `SimpleDashboard` (`components/simple-dashboard.tsx`, the `/` root
  route). Backed by `GET /achievements/subjects`
  (`useListMyAchievements`) — the same endpoint that resolves each
  subject's `achievements.ProgressBadge`, though this component only uses
  the completion-percent field, not the badge itself. The identical
  component also renders on the tutor's per-student overview page
  (`components/tutor/tutor-student-overview-page.tsx`), passed a
  `studentId` to switch it to the tutor-scoped endpoint
  (`useListTutorStudentAchievements`) with an extra "open subject" link
  per row.
* **Full list — `/subjects` route:** `StudentSubjectsView`
  (`components/subjects/student-subjects-view.tsx`) picks one of three
  variants by `interfaceMode`: `SimpleSubjectsPage`
  (`components/subjects/simple-subjects-page.tsx`, default and Simple
  modes) or `PreschoolSubjectsShelf` (`@school-ahead/preschool-ui`,
  preschool mode — a vertical shelf of book-cover cards, not covered
  here). Backed by `GET /academics/my-subjects`.

## 2. Row layout (not a card grid)

Both the dashboard list and `/subjects` render one row per subject, not a
card. `SimpleSubjectsPage` uses a fixed CSS grid template
(`grid-cols-[1.5rem_minmax(0,1fr)_8rem_6rem_8rem_2.5rem]`) shared by header
and body rows so columns align like a real table:

1. Subject icon (`SimpleEntityIcon` — colored in Default mode, monochrome
   in Simple mode).
2. Subject name, plus (Default mode only) a pill showing the subject's
   currently-active `SubjectBlock` label.
3. `subject.group_name` (or a "no group" placeholder) — subjects can
   belong to a tutor-defined `SubjectGroup`; see §3.
4. `AttestationTypeBadge`.
5. A compact `ProgressBar`.
6. The completion percentage as text.

The whole row is a `<Link href="/subjects/{id}">`. There is no teacher
name, no "Lesson #N today" action pill, and no responsive card-count
breakpoints — the original spec's 3-4/2/1-column card grid was
**deliberately deleted** in favor of this list (see the comment at
`simple-subjects-page.tsx`'s `SimpleSubjectsPage` export: "the
(now-deleted) Standard shadowed-card grid"). The sidebar's
`SubjectProgressList` is even thinner — just name, percent, and a progress
bar, no icon/group/attestation columns.

## 3. Sort, group, and view controls

* **Sort:** `/subjects` supports name/progress via `SortableHeader`
  (`useSortState`, shared with `TutorClassesPage`'s identical row-list
  idiom). The dashboard sidebar has its own independent sort dropdown
  (curriculum order / name / progress asc / progress desc, via
  `useSubjectProgressViewStore`).
* **Group/flat toggle:** Both places can bucket subjects by
  `SubjectGroup` (real groups first by `group_order_index`, then an
  always-present "Без групи" bucket for ungrouped subjects last) or show
  one flat sorted list. `/subjects` persists this via
  `useSubjectsGroupedViewStore`; the sidebar via
  `useSubjectProgressViewStore` — two independent, client-side-only
  preferences, not server-synced like `interfaceMode`.

## 4. Interactivity

The entire row is the click target (an `<a>` wrapping every column), same
as the original spec intended — just a row instead of a card. Clicking
navigates to `/subjects/{subjectId}` (see `subjects.md`). The tutor-viewing
variant of `SubjectProgressList` adds a second, explicit "open subject"
icon-button per row (`extraHref` → `/tutor/subjects/{id}`) since the tutor
context needs both "view this student's angle" and "view the subject
itself."
