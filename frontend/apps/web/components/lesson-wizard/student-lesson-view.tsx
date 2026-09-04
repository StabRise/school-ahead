"use client";

import { useAuthStore } from "@school-ahead/api-client";
import { LessonWizard } from "./lesson-wizard";
import { PreschoolLessonView } from "@/components/preschool/lesson-view";

// Both interface modes share the same route/data — this just picks which
// experience renders it. See docs/interfaces/student/preschool/lesson.md.
export function StudentLessonView({ studentLessonId }: { studentLessonId: number }) {
  const isPreschool = useAuthStore((state) => state.user?.interfaceMode === "preschool");

  if (isPreschool) {
    return <PreschoolLessonView studentLessonId={studentLessonId} />;
  }
  return <LessonWizard studentLessonId={studentLessonId} />;
}
