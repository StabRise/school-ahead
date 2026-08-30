"use client";

import { useTranslations } from "next-intl";
import type { CompletionProgressOut, SubjectLessonOut, TopicOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Card } from "@/components/card";
import { StatusBadge } from "@/components/status-badge";
import { GradeSquareBadge } from "@/components/grade-square-badge";
import { getLessonTypeBorderColor } from "./lesson-type-border-color";

export type CoursePlanViewMode = "brief" | "full";

const SCHEDULED_DATE_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });

function percentColorClasses(percent: number) {
  if (percent >= 100) return "bg-green-100 text-green-700";
  if (percent > 0) return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-500";
}

// A lesson with no StudentLesson yet (student_lesson_id null) isn't openable
// — the title and task still show (per the Subject detail page spec) so a
// student can see what's coming, but the row renders as a plain, unlinked
// Card and a "not assigned yet" indicator instead of status/score badges.
function LessonRow({ lesson, viewMode }: { lesson: SubjectLessonOut; viewMode: CoursePlanViewMode }) {
  const t = useTranslations("SubjectDetail");
  const isAssigned = lesson.student_lesson_id !== null;

  return (
    <Card
      href={isAssigned ? `/lessons/${lesson.student_lesson_id}` : undefined}
      className={`flex flex-col gap-1.5 border-l-4 bg-white sm:flex-row sm:items-center sm:justify-between ${isAssigned ? "" : "opacity-60"}`}
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
        {isAssigned && lesson.status ? (
          <>
            {lesson.scheduled_date && (
              <span className="text-xs text-gray-500">
                {SCHEDULED_DATE_FORMAT.format(new Date(`${lesson.scheduled_date}T00:00:00`))}
              </span>
            )}
            <StatusBadge status={lesson.status} />
            <GradeSquareBadge gradePoints={lesson.grade_points} gradeResult={lesson.grade_result} />
          </>
        ) : (
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            {t("notAssignedYet")}
          </span>
        )}
      </div>
    </Card>
  );
}

export function TopicAccordionItem({
  topic,
  lessons,
  progress,
  expanded,
  onToggle,
  viewMode,
}: {
  topic: TopicOut;
  lessons: SubjectLessonOut[];
  progress: CompletionProgressOut | undefined;
  expanded: boolean;
  onToggle: () => void;
  viewMode: CoursePlanViewMode;
}) {
  const t = useTranslations("SubjectDetail");

  return (
    <div id={`topic-${topic.id}`} className="scroll-mt-4 overflow-hidden rounded-md border border-gray-200">
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
          {lessons.length === 0 ? (
            <p className="text-sm text-gray-500">{t("noLessonsInTopic")}</p>
          ) : (
            lessons.map((lesson) => <LessonRow key={lesson.id} lesson={lesson} viewMode={viewMode} />)
          )}
        </div>
      )}
    </div>
  );
}
