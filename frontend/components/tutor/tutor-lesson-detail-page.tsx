"use client";

import { useTranslations } from "next-intl";
import { useGetTutorLesson, useListTutorLessonStudents } from "@/lib/api/browser/tutor/tutor";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { Card } from "@/components/card";
import { StatusBadge } from "@/components/status-badge";
import { Markdown } from "@/components/markdown";
import { ContentTypeBadges } from "@/components/subjects/content-type-badges";
import { LessonContent } from "@/components/lesson-wizard/lesson-content";

const SCHEDULED_DATE_FORMAT = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function TutorLessonDetailPage({ lessonId }: { lessonId: number }) {
  const t = useTranslations("TutorLessonDetail");

  const lessonQuery = useGetTutorLesson(lessonId);
  const studentsQuery = useListTutorLessonStudents(lessonId);

  if (lessonQuery.isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (lessonQuery.isError || !lessonQuery.data) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  const lesson = lessonQuery.data;
  const students = studentsQuery.data ?? [];

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("breadcrumbMySubjects"), href: "/tutor/subjects" },
    { label: lesson.subject_name, href: `/tutor/subjects/${lesson.subject_id}` },
    { label: lesson.title },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">{lesson.title}</h1>
          <ContentTypeBadges lessonType={lesson.lesson_type} />
        </div>
      </div>

      <Card className="flex flex-col gap-4">
        <LessonContent content={lesson.content} materials={lesson.materials} />

        {lesson.lesson_type === "with_task" && lesson.task_content && (
          <div className="flex flex-col gap-2 border-t border-gray-200 pt-4">
            <h2 className="text-sm font-semibold text-gray-900">{t("taskContentTitle")}</h2>
            <Markdown content={lesson.task_content} embedYoutube embedPdf />
          </div>
        )}

        {lesson.lesson_type === "with_quiz" && lesson.quiz_questions.length > 0 && (
          <div className="flex flex-col gap-4 border-t border-gray-200 pt-4">
            <h2 className="text-sm font-semibold text-gray-900">{t("quizQuestionsTitle")}</h2>
            {lesson.quiz_questions.map((question, index) => (
              <div key={question.id} className="flex flex-col gap-2">
                <p className="text-sm font-medium text-gray-900">
                  {t("quizQuestionRow", { index: index + 1 })}
                </p>
                <Markdown content={question.prompt} />
                <ul className="flex flex-col gap-1 pl-4 text-sm text-gray-700">
                  {question.choices.map((choice) => (
                    <li key={choice.id} className="list-disc">
                      <Markdown content={choice.text} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-gray-900">{t("studentsTitle")}</h2>

        {studentsQuery.isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
        {studentsQuery.isError && <p className="text-sm text-red-600">{t("error")}</p>}
        {!studentsQuery.isLoading && !studentsQuery.isError && students.length === 0 && (
          <p className="text-sm text-gray-500">{t("noStudents")}</p>
        )}

        {students.length > 0 && (
          <ul className="flex flex-col gap-2">
            {students.map((item) => (
              <li key={item.student_lesson_id}>
                <Card
                  href={`/tutor/submissions/${item.student_lesson_id}`}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900">{item.student_name}</span>
                    <span className="text-xs text-gray-500">
                      {SCHEDULED_DATE_FORMAT.format(new Date(`${item.scheduled_date}T00:00:00`))}
                    </span>
                  </div>
                  <StatusBadge status={item.status} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
