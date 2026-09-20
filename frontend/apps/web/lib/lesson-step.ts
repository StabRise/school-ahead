// The two steps of a student's preschool lesson screen (components/preschool/
// lesson-view.tsx): the "magic screen" with the lesson's content, then the practice —
// the quiz or the task. The screen opens on the first, unless the link says
// `?step=practice`: what the subject page's player uses to take a child from a song
// straight to its quiz or task.
export type PreschoolLessonStep = "theory" | "practice";

export const LESSON_STEP_PARAM = "step";

export function initialLessonStep(param: string | null): PreschoolLessonStep {
  return param === "practice" ? "practice" : "theory";
}

// The path of a student's lesson, on the given step (the first, by default).
export function studentLessonHref(studentLessonId: number, step: PreschoolLessonStep = "theory"): string {
  const path = `/lessons/${studentLessonId}`;
  return step === "practice" ? `${path}?${LESSON_STEP_PARAM}=practice` : path;
}
