"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetTutorLessonQueryKey,
  useGetTutorLesson,
  useListTutorLessonStudents,
  useUpdateTutorLesson,
} from "@/lib/api/browser/tutor/tutor";
import type { LessonOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { Card } from "@/components/card";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { LessonContent } from "@/components/lesson-wizard/lesson-content";
import { LESSON_TYPE_ICON } from "@/components/simple/lesson-type-icon";
import { formatShortDate, resolveStatusLabel } from "@/components/simple/format";
import { Monitor } from "lucide-react";
import { AssignStudentDialog } from "./assign-student-dialog";

const LESSON_TYPE_OPTIONS = [
  { value: "theory", labelKey: "contentTheory" },
  { value: "with_task", labelKey: "contentTask" },
  { value: "with_quiz", labelKey: "contentQuiz" },
] as const;

const GRADING_TYPE_OPTIONS = [
  { value: "points", labelKey: "gradingTypePoints" },
  { value: "binary", labelKey: "gradingTypeBinary" },
] as const;

// theory/with_quiz/with_task -> the same content-type i18n keys
// ContentTypeBadges (components/subjects/content-type-badges.tsx) uses —
// reused here as a plain grey icon+label instead of that component's
// colored pill, since ContentTypeBadges is still used as-is by other,
// out-of-scope Standard views.
const CONTENT_TYPE_LABEL_KEY: Record<string, string> = {
  theory: "contentTheory",
  with_quiz: "contentQuiz",
  with_task: "contentTask",
};

// Inline "edit mode" for the lesson's own fields (title, content,
// task_content, lesson_type, grading_type) — quiz questions/choices stay
// read-only for now (see backend LessonUpdateIn). Local form state is
// seeded from `lesson` once on mount (the caller remounts this via `key`
// whenever edit mode is (re-)entered), so a Cancel just unmounts it.
function LessonEditForm({ lesson, onSaved, onCancel }: { lesson: LessonOut; onSaved: () => void; onCancel: () => void }) {
  const t = useTranslations("TutorLessonDetail");
  // lesson_type option labels reuse ContentTypeBadges' existing translations
  // (contentTheory/contentQuiz/contentTask) rather than duplicating them.
  const tContentType = useTranslations("SubjectDetail");
  const queryClient = useQueryClient();
  const updateLesson = useUpdateTutorLesson();

  const [title, setTitle] = useState(lesson.title);
  const [content, setContent] = useState(lesson.content);
  const [taskContent, setTaskContent] = useState(lesson.task_content);
  const [lessonType, setLessonType] = useState(lesson.lesson_type);
  const [gradingType, setGradingType] = useState(lesson.grading_type);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    updateLesson.mutate(
      {
        lessonId: lesson.id,
        data: {
          title,
          content,
          task_content: taskContent,
          lesson_type: lessonType,
          grading_type: gradingType,
        },
      },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetTutorLessonQueryKey(lesson.id), data);
          onSaved();
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="lesson-title" className="text-xs font-medium text-gray-700">
            {t("titleLabel")}
          </label>
          <input
            id="lesson-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-lg font-semibold text-gray-900"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="lesson-type" className="text-xs font-medium text-gray-700">
              {t("lessonTypeLabel")}
            </label>
            <select
              id="lesson-type"
              value={lessonType}
              onChange={(e) => setLessonType(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
            >
              {LESSON_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {tContentType(option.labelKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="grading-type" className="text-xs font-medium text-gray-700">
              {t("gradingTypeLabel")}
            </label>
            <select
              id="grading-type"
              value={gradingType}
              onChange={(e) => setGradingType(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
            >
              {GRADING_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">{t("contentLabel")}</label>
          <MarkdownEditor value={content} onChange={setContent} />
        </div>

        <div className="flex flex-col gap-1 border-t border-gray-200 pt-4">
          <label className="text-xs font-medium text-gray-700">{t("taskContentLabel")}</label>
          <MarkdownEditor value={taskContent} onChange={setTaskContent} rows={6} />
        </div>
      </Card>

      {updateLesson.isError && <p className="text-sm text-red-600">{t("updateError")}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {t("cancelButton")}
        </button>
        <button
          type="submit"
          disabled={updateLesson.isPending}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("saveButton")}
        </button>
      </div>
    </form>
  );
}

export function TutorLessonDetailPage({ lessonId }: { lessonId: number }) {
  const t = useTranslations("TutorLessonDetail");
  const tContentType = useTranslations("SubjectDetail");
  const tStatus = useTranslations("LessonStatus");
  const [isEditing, setIsEditing] = useState(false);

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
  const LessonTypeIcon = LESSON_TYPE_ICON[lesson.lesson_type] ?? Monitor;

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("breadcrumbMySubjects"), href: "/tutor/subjects" },
    { label: lesson.class_name },
    { label: lesson.subject_name, href: `/tutor/subjects/${lesson.subject_id}` },
    ...(lesson.subject_block_label ? [{ label: lesson.subject_block_label }] : []),
    { label: lesson.topic_title },
    { label: t("breadcrumbLessonRow", { index: lesson.order_index, title: lesson.title }) },
  ];

  if (isEditing) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <Breadcrumbs items={breadcrumbItems} />
        <LessonEditForm
          key={lesson.id}
          lesson={lesson}
          onSaved={() => setIsEditing(false)}
          onCancel={() => setIsEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-gray-900">{lesson.title}</h1>
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <LessonTypeIcon className="size-3.5 text-gray-400" aria-hidden="true" />
              {tContentType(CONTENT_TYPE_LABEL_KEY[lesson.lesson_type] ?? "contentTheory")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t("editButton")}
            </button>
            <AssignStudentDialog lessonId={lessonId} />
          </div>
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

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-gray-900">{t("studentsTitle")}</h2>

        {studentsQuery.isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
        {studentsQuery.isError && <p className="text-sm text-red-600">{t("error")}</p>}
        {!studentsQuery.isLoading && !studentsQuery.isError && students.length === 0 && (
          <p className="text-sm text-gray-500">{t("noStudents")}</p>
        )}

        {students.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {students.map((item) => (
              <li key={item.student_lesson_id}>
                <Link
                  href={`/tutor/submissions/${item.student_lesson_id}`}
                  className="flex items-center justify-between gap-4 rounded px-2 py-2 hover:bg-gray-50"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900">{item.student_name}</span>
                    <span className="text-xs text-gray-500">{formatShortDate(item.scheduled_date)}</span>
                  </div>
                  <span className="shrink-0 text-xs text-gray-500">{resolveStatusLabel(item.status, tStatus)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
