"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Monitor } from "lucide-react";
import {
  getGetNextLessonQueryKey,
  getGetSubjectProgressQueryKey,
  getListStudentSubjectLessonsQueryKey,
  usePreviewLesson,
  useStartLessonToday,
} from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import { Markdown } from "@school-ahead/markdown-editor";
import { Link, useRouter } from "@/i18n/navigation";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { Card } from "@/components/card";
import { SimplePageContainer } from "@/components/simple/page-container";
import { LessonContent } from "@/components/lesson-wizard/lesson-content";
import { LESSON_TYPE_ICON } from "@/components/simple/lesson-type-icon";
import { subjectTopicAnchorId } from "@/components/subjects/subject-anchors";

const CONTENT_TYPE_LABEL_KEY: Record<string, string> = {
  theory: "contentTheory",
  with_quiz: "contentQuiz",
  with_task: "contentTask",
};

// A student's read-only preview of a Lesson they don't have a StudentLesson
// for yet — reachable only when their StudentProfile.can_do_any_lesson is
// set (backend 403s otherwise, see lessons.api.preview_lesson), linked from
// the "not assigned yet" rows on the Subject detail page's lesson list.
// "Я хочу зробити це сьогодні" creates today's StudentLesson and jumps
// straight into the real lesson wizard at /lessons/{student_lesson_id} —
// same content component (LessonContent) the tutor's own lesson preview
// (components/tutor/tutor-lesson-detail-page.tsx) uses.
export function LessonPreviewPage({ lessonId }: { lessonId: number }) {
  const t = useTranslations("LessonPreview");
  const tSubject = useTranslations("SubjectDetail");
  const router = useRouter();
  const queryClient = useQueryClient();

  const previewQuery = usePreviewLesson(lessonId);
  const startToday = useStartLessonToday();

  if (previewQuery.isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (previewQuery.isError || !previewQuery.data) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  const lesson = previewQuery.data;
  const LessonTypeIcon = LESSON_TYPE_ICON[lesson.lesson_type] ?? Monitor;

  const handleStartToday = () => {
    startToday.mutate(
      { lessonId },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListStudentSubjectLessonsQueryKey(lesson.subject_id) });
          queryClient.invalidateQueries({ queryKey: getGetNextLessonQueryKey(lesson.subject_id) });
          queryClient.invalidateQueries({ queryKey: getGetSubjectProgressQueryKey(lesson.subject_id) });
          router.push(`/lessons/${data.student_lesson_id}`);
        },
      },
    );
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: tSubject("breadcrumbMySubjects"), href: "/subjects" },
    { label: lesson.subject_name, href: `/subjects/${lesson.subject_id}` },
    {
      label: lesson.topic_title,
      href: `/subjects/${lesson.subject_id}#${subjectTopicAnchorId(lesson.topic_id)}`,
    },
    { label: lesson.title },
  ];

  return (
    <SimplePageContainer>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Breadcrumbs items={breadcrumbItems} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-900">{lesson.title}</h1>
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <LessonTypeIcon className="size-3.5 text-gray-400" aria-hidden="true" />
                {tSubject(CONTENT_TYPE_LABEL_KEY[lesson.lesson_type] ?? "contentTheory")}
              </span>
            </div>
            {lesson.student_lesson_id !== null ? (
              <Link
                href={`/lessons/${lesson.student_lesson_id}`}
                className="shrink-0 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
              >
                {t("continueButton")}
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleStartToday}
                disabled={startToday.isPending}
                className="shrink-0 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {startToday.isPending ? t("starting") : t("startTodayButton")}
              </button>
            )}
          </div>
          {startToday.isError && <p className="text-sm text-red-600">{t("startError")}</p>}
        </div>

        <Card className="flex flex-col gap-4">
          <LessonContent content={lesson.content} materials={lesson.materials} />

          {lesson.lesson_type === "with_task" && lesson.task_content && (
            <div className="flex flex-col gap-2 border-t border-gray-200 pt-4">
              <h2 className="text-sm font-semibold text-gray-900">{t("taskContentTitle")}</h2>
              <Markdown content={lesson.task_content} embedYoutube embedPdf />
            </div>
          )}
        </Card>
      </div>
    </SimplePageContainer>
  );
}
