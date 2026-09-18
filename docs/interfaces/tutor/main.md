# Tutor Main Screen

Documents what's actually built, as of this writing — the original spec's
"Rapid Response Dashboard" (a cross-student, cross-class feed of Need-Help
and Pending-Review items) **was never built**. There is no `/tutor` index
route at all and no unified urgent-items feed anywhere in the frontend;
tutor navigation is hierarchical instead.

## 1. What actually exists

No `page.tsx` exists at the `/tutor` route root — `TutorClassesPage`
(`components/tutor/tutor-classes-page.tsx`, at `/tutor/classes`) is the
tutor's effective landing screen: a sortable row-list of the tutor's
classes (same row-list idiom as `subjects_list.md`'s `/subjects`), each
row linking to `/tutor/classes/{id}` for that class's students.

From there, drilling into a specific student
(`components/tutor/tutor-student-overview-page.tsx`) surfaces that
student's `SubjectProgressList` (with per-subject progress/badges) and a
`SimpleCalendar` in tutor-management mode — grading and Need-Help
resolution happen at the individual lesson/submission level, reached by
navigating into a specific student → subject → lesson, not from a global
feed.

`/tutor/submissions/{studentLessonId}` (`components/tutor/
submission-review.tsx`) exists as a **detail page only** — there is no
`/tutor/submissions` index listing all pending submissions across
students/classes. It's reached from within a student's lesson list, not
from a cross-student queue.

## 2. What the spec described that isn't built

* A single screen aggregating every "Need Help" flag across all of a
  tutor's assigned subjects/classes, with student name, class, subject,
  and lesson surfaced together.
* A single screen aggregating every "Pending Review" submission the same
  way, filterable by subject/class.

Both remain genuinely useful ideas not yet implemented — a tutor currently
has to know which class/student to check rather than being alerted
proactively. If this gets built, it likely belongs as a new dashboard
section rather than replacing `/tutor/classes`, since the classes list
still serves the "manage my classes" need on its own.
