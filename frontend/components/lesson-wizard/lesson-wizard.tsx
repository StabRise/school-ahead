"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useGetStudentLesson } from "@/lib/api/browser/student-lessons/student-lessons";
import type { StudentLessonOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { StatusBadge } from "@/components/status-badge";
import { SubmissionThread } from "@/components/submission-thread";
import { LessonContent } from "./lesson-content";
import { QuizStep } from "./quiz-step";
import { TheoryStep } from "./theory-step";
import { TaskStep } from "./task-step";
import { LessonComments } from "./lesson-comments";
import { NeedHelpButton } from "./need-help-button";
import { ResolveNeedHelpButton } from "./resolve-need-help-button";

function AssignmentStep({
  studentLesson,
  onChanged,
}: {
  studentLesson: StudentLessonOut;
  onChanged: () => void;
}) {
  const t = useTranslations("LessonWizard");
  const { status, lesson, grade_points, grade_result, submissions } = studentLesson;

  const content = (() => {
    if (status === "revision_required") {
      return (
        <TaskStep
          studentLessonId={studentLesson.id}
          taskContent={lesson.task_content}
          isResubmit
          onChanged={onChanged}
        />
      );
    }

    if (status === "need_help") {
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-gray-600">{t("needHelpWaiting")}</p>
          <ResolveNeedHelpButton studentLessonId={studentLesson.id} onResolved={onChanged} />
        </div>
      );
    }

    if (status === "pending_review") {
      return <p className="text-sm text-gray-600">{t("pendingReviewWaiting")}</p>;
    }

    if (status === "completed") {
      return (
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold text-green-700">{t("completedTitle")}</p>
          {grade_points !== null && (
            <p className="text-sm text-gray-700">{t("gradePoints", { points: grade_points })}</p>
          )}
          {grade_result && (
            <p className="text-sm text-gray-700">
              {grade_result === "pass" ? t("gradePass") : t("gradeFail")}
            </p>
          )}
        </div>
      );
    }

    // assigned or in_progress
    switch (lesson.lesson_type) {
      case "with_quiz":
        return (
          <QuizStep
            studentLessonId={studentLesson.id}
            questions={lesson.quiz_questions}
            onChanged={onChanged}
          />
        );
      case "theory":
        return <TheoryStep studentLessonId={studentLesson.id} onChanged={onChanged} />;
      case "with_task":
        return (
          <TaskStep
            studentLessonId={studentLesson.id}
            taskContent={lesson.task_content}
            isResubmit={false}
            onChanged={onChanged}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <div className="flex flex-col gap-4">
      {lesson.lesson_type === "with_task" && submissions.length > 0 && (
        <SubmissionThread submissions={submissions} />
      )}
      {content}
    </div>
  );
}

export function LessonWizard({ studentLessonId }: { studentLessonId: number }) {
  const t = useTranslations("LessonWizard");
  const [showContent, setShowContent] = useState(true);
  // The backend auto-transitions Assigned -> InProgress the moment this GET
  // resolves (see lessons/services.ensure_started), so there is no explicit
  // "Start Lesson" action here anymore — see the "State Transition & UI
  // Rules" spec, section 2.1.
  const { data, isLoading, isError, refetch } = useGetStudentLesson(studentLessonId);

  if (isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (isError || !data) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{data.lesson.title}</h1>
        <div className="flex items-center gap-2">
          {data.status === "in_progress" && (
            <NeedHelpButton studentLessonId={studentLessonId} onRequested={refetch} />
          )}
          <StatusBadge status={data.status} />
        </div>
      </div>

      {showContent ? (
        <div className="flex flex-col gap-4">
          <LessonContent content={data.lesson.content} materials={data.lesson.materials} />
          <button
            type="button"
            onClick={() => setShowContent(false)}
            className="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            {t("goToTaskButton")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setShowContent(true)}
            className="self-start text-sm text-blue-600 underline hover:no-underline"
          >
            {t("back")}
          </button>
          <AssignmentStep studentLesson={data} onChanged={refetch} />
        </div>
      )}

      <LessonComments studentLessonId={studentLessonId} />
    </div>
  );
}
