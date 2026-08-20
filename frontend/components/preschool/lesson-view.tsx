"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useGetStudentLesson } from "@/lib/api/browser/student-lessons/student-lessons";
import type { StudentLessonOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Markdown } from "@/components/markdown";
import { TheoryStep } from "@/components/lesson-wizard/theory-step";
import { TaskStep } from "@/components/lesson-wizard/task-step";
import { ResolveNeedHelpButton } from "@/components/lesson-wizard/resolve-need-help-button";
import { Cloud, Daisy, Sun, Tulip } from "@/components/preschool/decorations";
import { Raccoon } from "@/components/preschool/raccoon";
import { PreschoolQuizGame } from "@/components/preschool/quiz-game";

type MagicStep = "theory" | "practice";

function ExitButton() {
  const t = useTranslations("PreschoolLesson");
  return (
    <Link
      href="/"
      aria-label={t("exitLabel")}
      className="absolute left-4 top-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-emerald-800 shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path
          d="M4 12L12 5l8 7M6 10.5V19h4v-5h4v5h4v-8.5"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

// Step 1, "Магический экран" — a big colorful title over a cottage-window
// frame holding the lesson's content (usually a YouTube video). See
// docs/interfaces/student/preschool/lesson.md.
function MagicScreen({ title, content, onContinue }: { title: string; content: string; onContinue: () => void }) {
  const t = useTranslations("PreschoolLesson");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      <h1 className="bg-gradient-to-r from-red-500 via-amber-400 to-sky-500 bg-clip-text text-center text-4xl font-extrabold text-transparent drop-shadow-sm sm:text-5xl">
        {title}
      </h1>

      <div className="relative w-full max-w-2xl">
        <svg viewBox="0 0 200 40" className="mx-auto -mb-1 w-40" aria-hidden="true">
          <path d="M0 40L100 2L200 40Z" fill="#92400e" />
        </svg>
        <div className="rounded-[2rem] border-[10px] border-amber-800 bg-sky-50 p-4 shadow-2xl">
          <div className="rounded-2xl bg-white p-3 [&_.prose]:max-w-none">
            <Markdown content={content} embedYoutube />
          </div>
        </div>
        <Tulip className="absolute -bottom-5 left-2 h-10 w-10" />
        <Daisy className="absolute -bottom-5 right-2 h-8 w-8" color="#fca5a5" />
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="rounded-full bg-emerald-500 px-8 py-4 text-xl font-extrabold text-white shadow-xl transition-transform active:scale-95"
      >
        {t("continueButton")} 🎉
      </button>
    </div>
  );
}

// Step 2, "Игровая поляна" — the interactive practice step. Quiz lessons get
// the full raccoon-mascot game; other lesson types (and non-actionable
// statuses) get a simpler themed panel around the existing components.
function PracticeClearing({ studentLesson, onChanged }: { studentLesson: StudentLessonOut; onChanged: () => void }) {
  const t = useTranslations("PreschoolLesson");
  const { status, lesson, tutor_feedback } = studentLesson;

  const body = (() => {
    if (status === "need_help") {
      return (
        <div className="flex flex-col items-center gap-4 text-center">
          <Raccoon mood="idle" className="h-24 w-24" />
          <p className="text-lg font-semibold text-emerald-900">{t("needHelpWaiting")}</p>
          <ResolveNeedHelpButton studentLessonId={studentLesson.id} onResolved={onChanged} />
        </div>
      );
    }

    if (status === "pending_review") {
      return (
        <div className="flex flex-col items-center gap-4 text-center">
          <Raccoon mood="idle" className="h-24 w-24" />
          <p className="text-lg font-semibold text-emerald-900">{t("pendingReviewWaiting")}</p>
        </div>
      );
    }

    if (status === "completed") {
      return (
        <div className="flex flex-col items-center gap-4 text-center">
          <Raccoon mood="happy" className="h-28 w-28" />
          <p className="text-2xl font-extrabold text-emerald-900">{t("completedTitle")}</p>
        </div>
      );
    }

    if (status === "revision_required") {
      return (
        <div className="w-full max-w-xl rounded-3xl bg-white/90 p-5 shadow-xl">
          <TaskStep
            studentLessonId={studentLesson.id}
            taskContent={lesson.task_content}
            isResubmit
            onChanged={onChanged}
          />
        </div>
      );
    }

    // assigned or in_progress
    switch (lesson.lesson_type) {
      case "with_quiz":
        return (
          <PreschoolQuizGame studentLessonId={studentLesson.id} questions={lesson.quiz_questions} onChanged={onChanged} />
        );
      case "theory":
        return (
          <div className="w-full max-w-xl rounded-3xl bg-white/90 p-5 shadow-xl">
            <TheoryStep studentLessonId={studentLesson.id} onChanged={onChanged} />
          </div>
        );
      case "with_task":
        return (
          <div className="w-full max-w-xl rounded-3xl bg-white/90 p-5 shadow-xl">
            <TaskStep
              studentLessonId={studentLesson.id}
              taskContent={lesson.task_content}
              isResubmit={false}
              onChanged={onChanged}
            />
          </div>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="flex flex-1 flex-col items-center gap-4 p-4">
      {tutor_feedback && (
        <div className="w-full max-w-xl rounded-2xl border-2 border-blue-200 bg-blue-50 px-4 py-3">
          <h2 className="text-sm font-bold text-blue-900">{t("teacherFeedbackTitle")}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-blue-900">{tutor_feedback}</p>
        </div>
      )}
      {body}
    </div>
  );
}

export function PreschoolLessonView({ studentLessonId }: { studentLessonId: number }) {
  const t = useTranslations("PreschoolLesson");
  const [step, setStep] = useState<MagicStep>("theory");
  const { data, isLoading, isError, refetch } = useGetStudentLesson(studentLessonId);

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-gradient-to-b from-sky-300 via-emerald-100 to-lime-200">
      <div className="pointer-events-none absolute inset-0">
        <Cloud className="left-6 top-4 h-10 w-16 opacity-90" />
        <Cloud className="right-8 top-10 h-8 w-14 opacity-70" />
        <Sun className="right-1/4 top-6 h-8 w-8" />
      </div>

      <ExitButton />

      {isLoading && <p className="relative m-auto text-lg font-medium text-emerald-900">{t("loading")}</p>}
      {isError && <p className="relative m-auto text-lg font-medium text-red-700">{t("error")}</p>}

      {data &&
        (step === "theory" ? (
          <MagicScreen
            title={data.lesson.title}
            content={data.lesson.content}
            onContinue={() => setStep("practice")}
          />
        ) : (
          <PracticeClearing studentLesson={data} onChanged={refetch} />
        ))}
    </div>
  );
}
