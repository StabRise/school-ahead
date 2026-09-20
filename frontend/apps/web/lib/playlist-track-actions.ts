import type { PlaylistTrackOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

// What the player's ✅ and ❤️ (components/subjects/subject-player-actions.tsx) may
// do for the song being played. Pure, so it can be tested without a player.
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
//   "available" — a theory lesson still to do (never started, or in progress),
//                 finished the way the lesson screen's "Чи все зрозуміло?" does;
//   "hidden"    — anything else: a quiz or a task is finished by its own quiz or
//                 by the tutor's review (not by a tap here), a lesson waiting for
//                 the tutor or help can't be finished by the child, and a student
//                 who may not start this lesson has nothing to mark.
export type MarkDoneState = "done" | "available" | "hidden";

const FINISHABLE_STATUSES: ReadonlyArray<string | null | undefined> = [null, undefined, "assigned", "in_progress"];

export function markDoneState(track: PlaylistTrackOut, canDoAnyLesson: boolean): MarkDoneState {
  if (track.status === "completed") return "done";
  if (track.lesson_type !== "theory") return "hidden";
  if (!FINISHABLE_STATUSES.includes(track.status)) return "hidden";
  return canStartTrack(track, canDoAnyLesson) ? "available" : "hidden";
}
