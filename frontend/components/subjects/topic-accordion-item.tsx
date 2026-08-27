"use client";

import { useTranslations } from "next-intl";
import { useListTopicLessons } from "@/lib/api/browser/student-lessons/student-lessons";
import type { CompletionProgressOut, TopicOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Card } from "@/components/card";
import { StatusBadge } from "@/components/status-badge";
import { ScoreBadge } from "@/components/score-badge";
import { getLessonTypeBorderColor } from "./lesson-type-border-color";

export type CoursePlanViewMode = "brief" | "full";

// Generous enough that a topic's full lesson list fits in one page — the
// accordion has no pagination of its own (see docs/interfaces/student/subjects_list.md).
// The paginated Topic detail page (topic-detail-page.tsx) remains the
// fallback for a topic with more lessons than this.
const TOPIC_LESSONS_LIMIT = 50;

function percentColorClasses(percent: number) {
  if (percent >= 100) return "bg-green-100 text-green-700";
  if (percent > 0) return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-500";
}

export function TopicAccordionItem({
  topic,
  progress,
  expanded,
  onToggle,
  viewMode,
}: {
  topic: TopicOut;
  progress: CompletionProgressOut | undefined;
  expanded: boolean;
  onToggle: () => void;
  viewMode: CoursePlanViewMode;
}) {
  const t = useTranslations("SubjectDetail");
  // Lazy: a collapsed topic's lessons are never fetched.
  const lessonsQuery = useListTopicLessons(
    topic.id,
    { limit: TOPIC_LESSONS_LIMIT },
    { query: { enabled: expanded } },
  );
  const lessons = lessonsQuery.data?.items ?? [];

  return (
    <div className="overflow-hidden rounded-md border border-gray-200">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-gray-900">{topic.title}</span>
          <span className="text-xs text-gray-500">
            {progress ? t("lessonsProgress", { completed: progress.completed_count, total: progress.total_count }) : "…"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {progress && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${percentColorClasses(progress.completed_percent)}`}>
              {Math.round(progress.completed_percent)}%
            </span>
          )}
          <svg
            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50/50 p-3">
          {lessonsQuery.isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
          {lessonsQuery.isError && <p className="text-sm text-red-600">{t("error")}</p>}
          {!lessonsQuery.isLoading && !lessonsQuery.isError && lessons.length === 0 && (
            <p className="text-sm text-gray-500">{t("noLessonsInTopic")}</p>
          )}
          {lessons.map((lesson) => (
            <Card
              key={lesson.id}
              href={`/lessons/${lesson.id}`}
              className="flex flex-col gap-1.5 border-l-4 bg-white sm:flex-row sm:items-center sm:justify-between"
              style={{ borderLeftColor: getLessonTypeBorderColor(lesson.lesson_type) }}
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-900">
                  {t("lessonRow", { index: lesson.order_index, title: lesson.title })}
                </span>
                {viewMode === "full" && lesson.task_content && (
                  <p className="text-xs text-gray-500">{lesson.task_content}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={lesson.status} />
                <ScoreBadge gradePoints={lesson.grade_points} gradeResult={lesson.grade_result} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
