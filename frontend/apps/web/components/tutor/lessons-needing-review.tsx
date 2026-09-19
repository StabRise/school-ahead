"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import {
  getListTutorLessonsNeedingReviewQueryKey,
  useListTutorLessonsNeedingReview,
  useSetTutorLessonNeedReview,
} from "@school-ahead/api-client/browser/tutor/tutor";
import { Link } from "@/i18n/navigation";
import { SimpleEntityIcon } from "@/components/simple/entity-icon";

// The tutor dashboard's "lessons that need review" section: lessons a student
// flagged with the warning button on the preschool lesson screen (the video
// won't play, ...) — Lesson.need_review. Each row links to the lesson so the
// tutor can fix it, and "problem fixed" clears the flag. Follows the
// dashboard's own subject/class filters (there's no student filter here: the
// flag is on the lesson, whoever reported it).
export function LessonsNeedingReview({ subjectId, classId }: { subjectId?: number; classId?: number }) {
  const t = useTranslations("TutorDashboard");
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useListTutorLessonsNeedingReview({ subject: subjectId, class_id: classId });
  const markFixed = useSetTutorLessonNeedReview();
  const lessons = data ?? [];

  const handleFixed = (lessonId: number) => {
    markFixed.mutate(
      { lessonId, data: { need_review: false } },
      {
        // The key without params matches the list under every filter.
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTutorLessonsNeedingReviewQueryKey() }),
      },
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-2">
      <h3 className="text-lg font-semibold">
        {t("needsReviewTitle")} <span className="text-sm font-normal text-gray-500">({lessons.length})</span>
      </h3>

      {isLoading && <p className="text-sm text-gray-500">...</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}
      {markFixed.isError && <p className="text-sm text-red-600">{t("needsReviewFixedError")}</p>}
      {!isLoading && !isError && lessons.length === 0 && (
        <p className="text-sm text-gray-500">{t("needsReviewEmpty")}</p>
      )}

      {lessons.length > 0 && (
        <ul className="flex flex-col divide-y divide-gray-100">
          {lessons.map((lesson) => (
            <li key={lesson.id} className="flex gap-3 rounded px-2 py-2 hover:bg-gray-50">
              <SimpleEntityIcon fallback={TriangleAlert} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link
                  href={`/tutor/lessons/${lesson.id}`}
                  className="truncate text-sm font-medium text-gray-900 hover:underline"
                >
                  {lesson.title}
                </Link>
                <p className="truncate text-xs text-gray-500">
                  <Link href={`/tutor/subjects/${lesson.subject_id}`} className="hover:underline">
                    {lesson.subject_name}
                  </Link>{" "}
                  · {lesson.topic_title}
                </p>
                <p className="truncate text-xs text-gray-400">
                  <Link href={`/tutor/classes/${lesson.class_id}`} className="hover:underline">
                    {lesson.class_name}
                  </Link>
                </p>
                <button
                  type="button"
                  disabled={markFixed.isPending && markFixed.variables?.lessonId === lesson.id}
                  onClick={() => handleFixed(lesson.id)}
                  className="mt-1 self-start rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {markFixed.isPending && markFixed.variables?.lessonId === lesson.id
                    ? t("needsReviewFixedPending")
                    : t("needsReviewFixedButton")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
