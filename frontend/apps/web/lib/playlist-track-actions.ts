import type { PlaylistTrackOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

// What the player's ✅, ❤️ and title (components/subjects/subject-player-actions.tsx)
// may do for the song being played. Pure, so it can be tested without a player.
//
// A song is a lesson; a signed-in student may have a StudentLesson for it
// already (`student_lesson_id`), or — when StudentProfile.can_do_any_lesson lets
// them start any lesson — get today's one created by the first tap (the same
// "start today" call a lesson card makes).
export function canStartTrack(track: PlaylistTrackOut, canDoAnyLesson: boolean): boolean {
  return track.student_lesson_id != null || canDoAnyLesson;
}

// The ✅ "mark this lesson done":
//   "done"      — already completed: shown as such, does nothing;
//   "available" — a THEORY lesson still to do (never started, or in progress),
//                 finished the way the lesson screen's "Чи все зрозуміло?" does;
//   "hidden"    — anything else: a quiz is finished by taking it and a task by the
//                 tutor's review (a tap here would skip that), a lesson waiting for the
//                 tutor or for help can't be finished by the child, and a student who
//                 may not start this lesson has nothing to mark.
export type MarkDoneState = "done" | "available" | "hidden";

const FINISHABLE_STATUSES: ReadonlyArray<string | null | undefined> = [null, undefined, "assigned", "in_progress"];

export function markDoneState(track: PlaylistTrackOut, canDoAnyLesson: boolean): MarkDoneState {
  if (track.status === "completed") return "done";
  if (track.lesson_type !== "theory") return "hidden";
  if (!FINISHABLE_STATUSES.includes(track.status)) return "hidden";
  return canStartTrack(track, canDoAnyLesson) ? "available" : "hidden";
}

// The ➡️ to the lesson's step 2 (its quiz or task): for a lesson that is not theory — a
// tap on ✅ can't finish that — and only until it is done: a finished lesson has nothing left
// to do there, and shows the green ✅ icon instead.
export function canGoToPractice(track: PlaylistTrackOut): boolean {
  return track.lesson_type !== "theory" && track.status !== "completed";
}

// Where the song's title leads — the lesson itself:
//   "preview" — a visitor who isn't signed in: the read-only lesson;
//   "lesson"  — the student's own lesson screen;
//   "start"   — the student has none yet: today's one is created, then opened;
//   null      — nowhere: the student may not start a lesson they don't have.
export type TrackLessonTarget =
  | { kind: "preview"; lessonId: number }
  | { kind: "lesson"; studentLessonId: number }
  | { kind: "start"; lessonId: number }
  | null;

export function trackLessonTarget(
  track: PlaylistTrackOut,
  { guest, canDoAnyLesson }: { guest: boolean; canDoAnyLesson: boolean },
): TrackLessonTarget {
  if (guest) return { kind: "preview", lessonId: track.lesson_id };
  if (track.student_lesson_id != null) return { kind: "lesson", studentLessonId: track.student_lesson_id };
  return canDoAnyLesson ? { kind: "start", lessonId: track.lesson_id } : null;
}
