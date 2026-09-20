"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import { currentLessonExitHref } from "@/lib/lesson-exit";
import { initialLessonStep, LESSON_STEP_PARAM, type PreschoolLessonStep } from "@/lib/lesson-step";
import {
  getGetStudentLessonQueryKey,
  useGetStudentLesson,
  useReportLessonProblem,
  useSetStudentLessonFavorite,
} from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import type { StudentLessonOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { extractYoutubeVideo, Markdown, YoutubeEmbed } from "@school-ahead/markdown-editor";
import { HeartIcon } from "@/components/preschool/heart-icon";
import { TaskStep } from "@/components/lesson-wizard/task-step";
import { ResolveNeedHelpButton } from "@/components/lesson-wizard/resolve-need-help-button";
import {
  Cloud,
  Sun,
  Raccoon,
  CelebrationScene,
  PreschoolButton,
  PreschoolTheoryCheck,
  ScreenFrame,
} from "@school-ahead/preschool-ui";
import { PreschoolQuizGame } from "@/components/preschool/quiz-game";
import { speak, toSpeechText } from "@school-ahead/api-client";

// Lesson titles have no language field of their own (unlike quiz questions,
// see QuizQuestion.language) — the read-aloud button always uses Ukrainian.
const LESSON_TITLE_LANGUAGE = "uk";

type MagicStep = PreschoolLessonStep;

// The round house button. Goes back to the dashboard if the child opened the
// lesson from there, otherwise to the lesson's own subject page — decided when
// it's tapped, from the route the child came from (lib/lesson-exit.ts), since
// a lesson can be opened from the dashboard, the subject page, the calendar...
// `subjectId` is null until the lesson has loaded.
export function ExitButton({ subjectId }: { subjectId: number | null }) {
  const t = useTranslations("PreschoolLesson");
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(currentLessonExitHref(subjectId))}
      aria-label={t("exitLabel")}
      className="absolute left-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white text-orange-600 shadow-lg ring-2 ring-orange-400/50 transition-all duration-200 hover:scale-110 hover:bg-orange-50 hover:ring-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-[2.5]" aria-hidden="true">
        <path
          d="M4 12L12 5l8 7M6 10.5V19h4v-5h4v5h4v-8.5"
          stroke="currentColor"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

// The heart in the top-right corner — marks (or unmarks) the lesson as one of
// the child's favourites (StudentLesson.is_favorite). Lives on the screen
// itself, not in either step, so it's there for the whole lesson: just left of
// the "next" arrow while that is showing (`besideNextArrow`, the first step),
// in the corner itself once it isn't. The heart
// flips at once and is rolled back if the request fails: a child taps it and
// expects an instant answer, not a wait on the network.
function FavoriteButton({
  studentLessonId,
  isFavorite,
  besideNextArrow,
}: {
  studentLessonId: number;
  isFavorite: boolean;
  besideNextArrow: boolean;
}) {
  const t = useTranslations("PreschoolLesson");
  const queryClient = useQueryClient();
  const setFavorite = useSetStudentLessonFavorite();

  const showFavorite = (value: boolean) =>
    queryClient.setQueryData<StudentLessonOut>(
      getGetStudentLessonQueryKey(studentLessonId),
      (lesson) => lesson && { ...lesson, is_favorite: value },
    );

  const handleClick = () => {
    const next = !isFavorite;
    showFavorite(next);
    setFavorite.mutate({ studentLessonId, data: { is_favorite: next } }, { onError: () => showFavorite(!next) });
  };

  return (
    <PreschoolButton
      icon={<HeartIcon filled={isFavorite} className="h-5 w-5" />}
      label={isFavorite ? t("favoriteRemoveLabel") : t("favoriteAddLabel")}
      ringColorClassName="ring-rose-400"
      position="static"
      className={`absolute top-4 ${besideNextArrow ? "right-16" : "right-4"}`}
      onClick={handleClick}
    />
  );
}

// The warning in the bottom-left corner — "something's wrong with this lesson" (the
// video won't play, ...). Flags the lesson for a tutor (Lesson.need_review,
// shown on the tutor dashboard). Pinned to the screen (a fixed corner, like
// PreschoolButton's other presets) so it's always there, far from the exit and
// heart at the top so it isn't tapped by mistake. Once flagged it turns into a green check and
// does nothing more: reporting is one-way for a child, and a lesson someone
// else already flagged shows as reported too — the tutor knows. Flips at once,
// like the heart, and rolls back if the request fails.
function ReportProblemButton({ studentLessonId, isReported }: { studentLessonId: number; isReported: boolean }) {
  const t = useTranslations("PreschoolLesson");
  const queryClient = useQueryClient();
  const reportProblem = useReportLessonProblem();

  const showReported = (value: boolean) =>
    queryClient.setQueryData<StudentLessonOut>(
      getGetStudentLessonQueryKey(studentLessonId),
      (studentLesson) => studentLesson && { ...studentLesson, lesson: { ...studentLesson.lesson, need_review: value } },
    );

  const handleClick = () => {
    if (isReported || reportProblem.isPending) return;
    showReported(true);
    reportProblem.mutate({ studentLessonId }, { onError: () => showReported(false) });
  };

  return (
    <PreschoolButton
      icon={isReported ? "✅" : "⚠️"}
      label={isReported ? t("problemReportedLabel") : t("reportProblemLabel")}
      ringColorClassName={isReported ? "ring-emerald-400" : "ring-amber-400"}
      position="bottom-left"
      onClick={handleClick}
    />
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
      className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white text-emerald-600 shadow-lg ring-2 ring-emerald-400/50 transition-all duration-200 hover:scale-110 hover:bg-emerald-50 hover:ring-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-[2.5]" aria-hidden="true">
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

// The big green "continue" pill under the lesson's content.
function ContinueButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("PreschoolLesson");
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-emerald-500 px-8 py-4 text-xl font-extrabold text-white shadow-xl transition-transform active:scale-95"
    >
      {t("continueButton")} 🎉
    </button>
  );
}

// Step 1, "Магический экран" — a big colorful title over a cottage-window
// frame holding the lesson's content (usually a YouTube video). See
// docs/interfaces/student/preschool/lesson.md. What comes next is up to the
// caller (`children`, under the frame): a student continues to the practice
// step, a visitor who isn't signed in is invited to sign in instead
// (PreschoolPublicLessonView).
export function MagicScreen({ title, content, children }: { title: string; content: string; children?: ReactNode }) {
  const t = useTranslations("PreschoolLesson");
  const { videoId, content: textContent } = extractYoutubeVideo(content);

  const handleReadTitle = () => {
    speak(toSpeechText(title), LESSON_TITLE_LANGUAGE);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-3">
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

      {children}
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

// The full-screen "forest clearing" every preschool lesson screen sits in —
// sky, clouds and sun behind whatever `children` draw.
export function PreschoolLessonScene({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-gradient-to-b from-sky-300 via-emerald-100 to-lime-200">
      <div className="pointer-events-none absolute inset-0">
        <Cloud className="left-6 top-4 h-10 w-16 opacity-90" />
        <Cloud className="right-8 top-10 h-8 w-14 opacity-70" />
        <Sun className="right-1/4 top-6 h-8 w-8" />
      </div>
      {children}
    </div>
  );
}

export function PreschoolLessonView({ studentLessonId }: { studentLessonId: number }) {
  const t = useTranslations("PreschoolLesson");
  // Opens on the content, or — from the subject page's player, for a lesson with a quiz
  // or a task — straight on the practice (`?step=practice`, see lib/lesson-step.ts).
  const searchParams = useSearchParams();
  const [step, setStep] = useState<MagicStep>(() => initialLessonStep(searchParams.get(LESSON_STEP_PARAM)));
  const { data, isLoading, isError, refetch } = useGetStudentLesson(studentLessonId);

  return (
    <PreschoolLessonScene>
      <ExitButton subjectId={data?.lesson.subject_id ?? null} />
      {data && (
        <FavoriteButton
          studentLessonId={studentLessonId}
          isFavorite={data.is_favorite}
          besideNextArrow={step === "theory"}
        />
      )}
      {data && <ReportProblemButton studentLessonId={studentLessonId} isReported={data.lesson.need_review} />}

      {isLoading && <p className="relative m-auto text-lg font-medium text-emerald-900">{t("loading")}</p>}
      {isError && <p className="relative m-auto text-lg font-medium text-red-700">{t("error")}</p>}

      {data &&
        (step === "theory" ? (
          <MagicScreen title={data.lesson.title} content={data.lesson.content}>
            <NextButton onClick={() => setStep("practice")} />
            <ContinueButton onClick={() => setStep("practice")} />
          </MagicScreen>
        ) : (
          <PracticeClearing studentLesson={data} onChanged={refetch} onBackToMaterials={() => setStep("theory")} />
        ))}
    </PreschoolLessonScene>
  );
}
