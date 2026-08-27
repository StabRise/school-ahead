"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useGetStudentLesson } from "@/lib/api/browser/student-lessons/student-lessons";
import type { StudentLessonOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { StatusBadge } from "@/components/status-badge";
import { ScoreBadge } from "@/components/score-badge";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { SubmissionThread } from "@/components/submission-thread";
import { Card } from "@/components/card";
import { LessonContent } from "./lesson-content";
import { QuizStep } from "./quiz-step";
import { TheoryStep } from "./theory-step";
import { TaskStep } from "./task-step";
import { LessonComments } from "./lesson-comments";
import { NeedHelpButton } from "./need-help-button";
import { ResolveNeedHelpButton } from "./resolve-need-help-button";
import { StepSwitcher, type WizardStep } from "./step-switcher";

// The wizard's second page — feedback from the tutor, the task/quiz
// interaction (only shown while actionable; otherwise a read-only status
// message), and the persistent comment thread. See docs/interfaces/student/
// lesson.md, "Assignment Step" & "Submission & Review Step".
function AssessmentStep({
  studentLesson,
  onChanged,
}: {
  studentLesson: StudentLessonOut;
  onChanged: () => void;
}) {
  const t = useTranslations("LessonWizard");
  const { status, lesson, tutor_feedback, submissions } = studentLesson;

  const interactiveContent = (() => {
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
      return <p className="text-sm font-medium text-green-700">{t("completedTitle")}</p>;
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
    <div className="flex flex-col gap-5">
      {tutor_feedback && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-blue-900">{t("teacherFeedbackTitle")}</h2>
          <p className="mt-1 text-sm whitespace-pre-wrap text-blue-900">{tutor_feedback}</p>
        </div>
      )}

      <Card className="flex flex-col gap-4">
        {lesson.lesson_type === "with_task" && submissions.length > 0 && (
          <SubmissionThread submissions={submissions} />
        )}
        {interactiveContent}
      </Card>

      <LessonComments studentLessonId={studentLesson.id} />
    </div>
  );
}

export function LessonWizard({ studentLessonId }: { studentLessonId: number }) {
  const t = useTranslations("LessonWizard");
  const [step, setStep] = useState<WizardStep>("materials");
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

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("breadcrumbLessons"), href: "/" },
    { label: data.lesson.subject_name, href: `/subjects/${data.lesson.subject_id}` },
    ...(data.lesson.subject_block_label ? [{ label: data.lesson.subject_block_label }] : []),
    { label: data.lesson.title },
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-none">
      <div className="flex flex-col gap-3 border-b border-gray-200 pb-4">
        <Breadcrumbs items={breadcrumbItems} />
        <StepSwitcher step={step} onChange={setStep} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{data.lesson.title}</h1>
          <div className="flex items-center gap-2">
            {data.status === "in_progress" && (
              <NeedHelpButton studentLessonId={studentLessonId} onRequested={refetch} />
            )}
            <StatusBadge status={data.status} />
            <ScoreBadge gradePoints={data.grade_points} gradeResult={data.grade_result} />
          </div>
        </div>
      </div>

      {step === "materials" ? (
        <div className="flex flex-col gap-4">
          <LessonContent content={data.lesson.content} materials={data.lesson.materials} />
          <button
            type="button"
            onClick={() => setStep("assessment")}
            className="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            {t("goToTaskButton")}
          </button>
        </div>
      ) : (
        <AssessmentStep studentLesson={data} onChanged={refetch} />
      )}
    </div>
  );
}
