"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import {
  useGetStudentLesson,
  useListLessonComments,
} from "@/lib/api/browser/student-lessons/student-lessons";
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
import { ExplanationThread } from "./explanation-thread";
import { NeedHelpButton } from "./need-help-button";
import { ResolveNeedHelpButton } from "./resolve-need-help-button";
import { StepSwitcher, type WizardStep } from "./step-switcher";
import { PageContainer } from "@/components/page-container";
import { Link, useRouter, usePathname } from "@/i18n/navigation";

const WIZARD_STEPS: WizardStep[] = ["materials", "assessment", "comments", "explanation"];

// Reads the active tab back out of `?step=...` — e.g. after an F5 reload,
// which loses any in-memory React state. Invalid/missing values fall back
// to null (the "materials" default), same as a fresh visit.
function parseStepParam(value: string | null): WizardStep | null {
  return value !== null && (WIZARD_STEPS as string[]).includes(value) ? (value as WizardStep) : null;
}

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

  const tutorFeedbackBanner = tutor_feedback && (
    <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3">
      <h2 className="text-sm font-semibold text-blue-900">{t("teacherFeedbackTitle")}</h2>
      <p className="mt-1 text-sm whitespace-pre-wrap text-blue-900">{tutor_feedback}</p>
    </div>
  );

  // A task has its own two-up layout — the assignment/form on a narrower
  // left, its upload history on a wider right — so past attempts stay
  // visible while working on the next one instead of scrolling past them.
  // Quiz/theory steps are a single self-contained interaction with nothing
  // to show alongside, so they keep the plain single-column card.
  if (lesson.lesson_type === "with_task") {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
          <Card className="flex flex-col gap-4 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-900">{t("uploadTaskTitle")}</h2>
            {tutorFeedbackBanner}
            {interactiveContent}
          </Card>
          {submissions.length > 0 && (
            <Card className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-gray-900">{t("submissionHistoryTitle")}</h2>
              <SubmissionThread submissions={submissions} />
            </Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {tutorFeedbackBanner}
      <Card className="flex flex-col gap-4">{interactiveContent}</Card>
    </div>
  );
}

// Which tab a student should land on without having clicked anything yet —
// need_help sends them straight to "Пояснення" (the question they need
// answered) and pending_review/revision_required to "Завдання" (their
// submission's current state); every other status keeps the usual
// "Теорія" landing tab. Returns null for that "usual" case since the
// component's own `step` state already defaults there.
function initialStepForStatus(status: string): WizardStep | null {
  if (status === "need_help") return "explanation";
  if (status === "pending_review" || status === "revision_required") return "assessment";
  return null;
}

export function LessonWizard({ studentLessonId }: { studentLessonId: number }) {
  const t = useTranslations("LessonWizard");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stepFromUrl = parseStepParam(searchParams.get("step"));

  const [step, setStepState] = useState<WizardStep | null>(stepFromUrl);
  // Whether the status-based landing tab (see initialStepForStatus) has been
  // applied yet — tracked as state, not a ref, so setting it below is a
  // normal render-time state adjustment rather than an effect (see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  // Starts true when the URL already names a step (e.g. an F5 reload) so
  // that doesn't get overridden by the status-based landing tab below.
  const [landingTabApplied, setLandingTabApplied] = useState(stepFromUrl !== null);

  // Keeps `?step=...` in sync with the active tab (omitted for the
  // "materials" default) so reloading — or sharing the link — lands back on
  // the same step instead of always resetting to "Матеріали".
  const setStep = (next: WizardStep) => {
    setStepState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "materials") {
      params.delete("step");
    } else {
      params.set("step", next);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  // The backend auto-transitions Assigned -> InProgress the moment this GET
  // resolves (see lessons/services.ensure_started), so there is no explicit
  // "Start Lesson" action here anymore — see the "State Transition & UI
  // Rules" spec, section 2.1.
  const { data, isLoading, isError, refetch } = useGetStudentLesson(studentLessonId);
  const { data: comments } = useListLessonComments(studentLessonId);
  const hasExplanation = (comments ?? []).some((comment) => comment.kind === "help_request");

  // Applies the status-based landing tab exactly once, the first render
  // `data` is available — `landingTabApplied` staying true afterwards means
  // a later status change (e.g. resolving the question while already on
  // "Пояснення") never yanks the tab away.
  if (data && !landingTabApplied) {
    setLandingTabApplied(true);
    const initialStep = initialStepForStatus(data.status);
    if (initialStep) setStepState(initialStep);
  }

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
  const effectiveStep: WizardStep = step ?? "materials";

  return (
    <PageContainer>
      <Breadcrumbs items={breadcrumbItems} />
      <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 pt-4">

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-xl font-semibold text-gray-900">{data.lesson.title}</h1>
            <Link
              href={`/subjects/${data.lesson.subject_id}#topic-${data.lesson.topic_id}`}
              className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
            >
              {data.lesson.topic_title}
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={data.status} />
            <ScoreBadge gradePoints={data.grade_points} gradeResult={data.grade_result} />
          </div>
        </div>
        <StepSwitcher
          step={effectiveStep}
          lessonType={data.lesson.lesson_type}
          hasExplanation={hasExplanation}
          onChange={setStep}
        />
      </div>

      {effectiveStep === "materials" ? (
        <div className="flex flex-col gap-4">
          <LessonContent content={data.lesson.content} materials={data.lesson.materials} />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setStep("assessment")}
              className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              {data.lesson.lesson_type === "with_quiz" ? t("goToQuizButton") : t("goToTaskButton")}
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      ) : effectiveStep === "assessment" ? (
        <AssessmentStep studentLesson={data} onChanged={refetch} />
      ) : effectiveStep === "comments" ? (
        <LessonComments studentLessonId={studentLessonId} comments={comments} />
      ) : (
        <ExplanationThread
          comments={comments ?? []}
          studentLessonId={studentLessonId}
          canSelfResolve={data.status === "need_help"}
          onResolved={refetch}
        />
      )}

      {data.status === "in_progress" && (
        <NeedHelpButton studentLessonId={studentLessonId} onRequested={refetch} />
      )}
    </PageContainer>

  );
}
