"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { extractYoutubeVideo } from "@/lib/youtube";
import { useGetStudentLesson } from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import type { StudentLessonOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Markdown } from "@/components/markdown";
import { YoutubeEmbed } from "@/components/youtube-embed";
import { TaskStep } from "@/components/lesson-wizard/task-step";
import { ResolveNeedHelpButton } from "@/components/lesson-wizard/resolve-need-help-button";
import { Cloud, Sun, Raccoon, CelebrationScene, PreschoolTheoryCheck, ScreenFrame } from "@school-ahead/preschool-ui";
import { PreschoolQuizGame } from "@/components/preschool/quiz-game";
import { speak, toSpeechText } from "@school-ahead/api-client";

// Lesson titles have no language field of their own (unlike quiz questions,
// see QuizQuestion.language) — the read-aloud button always uses Ukrainian.
const LESSON_TITLE_LANGUAGE = "uk";

type MagicStep = "theory" | "practice";

function ExitButton() {
  const t = useTranslations("PreschoolLesson");
  return (
    <Link
      href="/"
      aria-label={t("exitLabel")}
      className="absolute left-6 top-6 z-20 flex h-16 w-16 items-center justify-center rounded-full bg-white text-orange-600 shadow-xl ring-4 ring-orange-400/50 transition-all duration-200 hover:scale-110 hover:bg-orange-50 hover:ring-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <svg viewBox="0 0 24 24" className="h-8 w-8 stroke-[2.5]" aria-hidden="true">
        <path
          d="M4 12L12 5l8 7M6 10.5V19h4v-5h4v5h4v-8.5"
          stroke="currentColor"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

// Mirrors ExitButton on the opposite corner — lets a kid who's already
// looked over the lesson content skip ahead without scrolling down to the
// button below the screen frame.
function NextButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("PreschoolLesson");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("continueButton")}
      className="absolute right-6 top-6 z-20 flex h-16 w-16 items-center justify-center rounded-full bg-white text-emerald-600 shadow-xl ring-4 ring-emerald-400/50 transition-all duration-200 hover:scale-110 hover:bg-emerald-50 hover:ring-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <svg viewBox="0 0 24 24" className="h-8 w-8 stroke-[2.5]" aria-hidden="true">
        <path
          d="M5 12h14M13 5l7 7-7 7"
          stroke="currentColor"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

// Step 1, "Магический экран" — a big colorful title over a cottage-window
// frame holding the lesson's content (usually a YouTube video). See
// docs/interfaces/student/preschool/lesson.md.
function MagicScreen({ title, content, onContinue }: { title: string; content: string; onContinue: () => void }) {
  const t = useTranslations("PreschoolLesson");
  const { videoId, content: textContent } = extractYoutubeVideo(content);

  const handleReadTitle = () => {
    speak(toSpeechText(title), LESSON_TITLE_LANGUAGE);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-3">
      <NextButton onClick={onContinue} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={t("readTitleButton")}
          onClick={handleReadTitle}
          className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-white text-2xl shadow-lg transition-transform active:scale-95"
        >
          🔊
        </button>
        <h2 className="bg-gradient-to-r from-red-500 via-amber-400 to-sky-500 bg-clip-text text-center text-4xl font-extrabold text-transparent drop-shadow-sm sm:text-5xl">
          {title}
        </h2>
      </div>

      {/* The video is pulled out of the markdown flow and rendered as its
          own full-width block — embedding it inline would tie its size to
          the (narrower, text-reading) prose column instead of the frame. */}
      <ScreenFrame maxWidthClassName={videoId ? "max-w-6xl" : "max-w-5xl"}>
        {videoId && <YoutubeEmbed videoId={videoId} />}
        {textContent && <Markdown content={textContent} embedYoutube embedPdf />}
      </ScreenFrame>

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
function PracticeClearing({
  studentLesson,
  onChanged,
  onBackToMaterials,
}: {
  studentLesson: StudentLessonOut;
  onChanged: () => void;
  onBackToMaterials: () => void;
}) {
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
      return <CelebrationScene title={t("completedTitle")} />;
    }

    if (status === "revision_required") {
      return (
        <div className="w-full max-w-4xl rounded-3xl bg-white/90 p-5 shadow-xl">
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
          <PreschoolQuizGame
            studentLessonId={studentLesson.id}
            questions={lesson.quiz_questions}
            onChanged={onChanged}
            onBackToMaterials={onBackToMaterials}
          />
        );
      case "theory":
        return <PreschoolTheoryCheck studentLessonId={studentLesson.id} onChanged={onChanged} />;
      case "with_task":
        return (
          <div className="w-full max-w-4xl rounded-3xl bg-white/90 p-5 shadow-xl">
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
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-3">
      {tutor_feedback && (
        <div className="w-full max-w-4xl rounded-2xl border-2 border-blue-200 bg-blue-50 px-4 py-3">
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
          <PracticeClearing studentLesson={data} onChanged={refetch} onBackToMaterials={() => setStep("theory")} />
        ))}
    </div>
  );
}
