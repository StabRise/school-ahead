"use client";

import { useLocale, useTranslations } from "next-intl";
import { useGetNextLesson } from "@/lib/api/browser/student-lessons/student-lessons";
import { Link } from "@/i18n/navigation";
import { ContentTypeBadges } from "./content-type-badges";

function formatLessonDate(dateStr: string, locale: string, todayLabel: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  const formatted = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(date);
  return date.toDateString() === new Date().toDateString() ? `${todayLabel}, ${formatted}` : formatted;
}

// task_content is markdown/HTML — strip it down to a short plain-text
// preview for the homework line rather than rendering it in full here
// (the full task is shown on the lesson wizard's submission step).
function homeworkPreview(taskContent: string, maxLength = 140): string {
  const plain = taskContent
    .replace(/<[^>]+>/g, " ")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[#*_`>~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength)}…` : plain;
}

export function NextLessonCard({ subjectId }: { subjectId: number }) {
  const t = useTranslations("SubjectDetail");
  const locale = useLocale();
  const { data, isLoading } = useGetNextLesson(subjectId);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 text-sm text-gray-500">
        {t("loading")}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
        {t("allLessonsCompleted")}
      </div>
    );
  }

  const dateLabel = formatLessonDate(data.scheduled_date, locale, t("today"));
  const homework = data.lesson_type === "with_task" ? homeworkPreview(data.task_content) : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-blue-700">
            {t("nextLessonLabel")}
          </span>
          <span className="text-xs text-gray-500">
            {data.subject_block_label ? `${data.subject_block_label} · ${data.topic_title}` : data.topic_title}
          </span>
          <span className="font-medium text-gray-900">{data.title}</span>
          <ContentTypeBadges lessonType={data.lesson_type} />
        </div>

        {/* Date pinned top-right, action button pinned bottom-right. */}
        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-between">
          <span className="inline-flex w-fit shrink-0 rounded-full bg-white px-2 py-0.5 text-xs text-gray-600">
            {dateLabel}
          </span>
          <Link
            href={`/lessons/${data.id}`}
            className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
          >
            {t("goToLesson")}
          </Link>
        </div>
      </div>

      {homework && (
        <div className="flex flex-col gap-2 border-t border-blue-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-700">
            <span className="font-medium">📌 {t("homeworkLabel")}:</span> {homework}
          </p>
          <Link
            href={`/lessons/${data.id}`}
            className="shrink-0 rounded-md border border-blue-600 px-4 py-2 text-center text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            {t("goToLesson")}
          </Link>
        </div>
      )}
    </div>
  );
}
