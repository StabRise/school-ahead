"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, X, XCircle } from "lucide-react";
import { getMeQueryKey } from "@school-ahead/api-client/browser/auth/auth";
import { getQuizQuestionHint, useSubmitQuiz } from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import type { QuizQuestionOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Markdown } from "@/components/markdown";
import { useAuthStore } from "@school-ahead/api-client";
import { useDiamondRewardStore } from "@school-ahead/preschool-ui";

const PASS_THRESHOLD_PERCENT = 60;
// Long enough for the student to read whether they got it right before the
// quiz moves on to the next question.
const FEEDBACK_DELAY_MS = 1400;

type Feedback = "correct" | "incorrect" | null;

// A restrained, exam-like quiz — a progress bar, one question at a time,
// plain bordered answer rows. Deliberately understated (no mascots,
// gradients, or oversized touch targets): this is the default (non-
// preschool) interface, aimed at teens and older students rather than young
// children — contrast components/preschool/quiz-game.tsx and balloon-quiz.tsx,
// which share this component's immediate-feedback interaction model but use
// a much more playful visual language for their younger audience.
// Answering a question reveals whether it was right, then advances to the
// next, all the way through the last one (which submits the quiz). See
// docs/interfaces/student/lesson.md.
export function QuizStep({
  studentLessonId,
  questions,
  onChanged,
}: {
  studentLessonId: number;
  questions: QuizQuestionOut[];
  onChanged: () => void;
}) {
  const t = useTranslations("QuizStep");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [selectedChoiceId, setSelectedChoiceId] = useState<number | null>(null);
  const [correctChoiceId, setCorrectChoiceId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const submitQuiz = useSubmitQuiz();
  const addDiamondFlight = useDiamondRewardStore((s) => s.addFlight);
  const addDiamonds = useAuthStore((s) => s.addDiamonds);
  const queryClient = useQueryClient();

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const isAnswered = lastScore !== null;

  const handleSelect = async (choiceId: number) => {
    if (selectedChoiceId !== null || submitQuiz.isPending) return;

    setSelectedChoiceId(choiceId);
    const nextAnswers = { ...answers, [currentQuestion.id]: choiceId };
    setAnswers(nextAnswers);

    let correctId: number | null = null;
    try {
      const hint = await getQuizQuestionHint(currentQuestion.id);
      correctId = hint.correct_choice_id;
      setCorrectChoiceId(correctId);
    } catch {
      // If the hint call fails, still let the student move on without a
      // right/wrong flourish — the real score is graded server-side.
    }
    setFeedback(correctId !== null && correctId === choiceId ? "correct" : "incorrect");

    window.setTimeout(() => {
      if (isLastQuestion) {
        submitQuiz.mutate(
          { studentLessonId, data: { answers: nextAnswers } },
          {
            onSuccess: (result) => {
              setLastScore(result.score_percent);
              const diamondsAwarded = result.student_lesson.diamonds_awarded;
              if (diamondsAwarded > 0) {
                // No natural "from" point for a completion happening off a
                // plain button click (unlike the balloon game's score
                // badge) — flies from screen-center, the same fallback the
                // balloon game itself uses when it has no rect to start
                // from.
                addDiamondFlight({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, diamondsAwarded);
                addDiamonds(diamondsAwarded);
                queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
              }
              onChanged();
            },
          },
        );
        return;
      }
      setCurrentIndex((index) => index + 1);
      setSelectedChoiceId(null);
      setCorrectChoiceId(null);
      setFeedback(null);
    }, FEEDBACK_DELAY_MS);
  };

  const handleRetry = () => {
    setAnswers({});
    setSelectedChoiceId(null);
    setCorrectChoiceId(null);
    setFeedback(null);
    setCurrentIndex(0);
    setLastScore(null);
  };

  const failed = isAnswered && lastScore! <= PASS_THRESHOLD_PERCENT;

  if (isAnswered) {
    return (
      <div className="flex flex-col gap-4">
        <div
          className={`flex items-start gap-3 rounded-md border px-4 py-4 ${
            failed ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"
          }`}
        >
          {failed ? (
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
          )}
          <div>
            <p className={`text-sm font-semibold ${failed ? "text-red-800" : "text-emerald-800"}`}>
              {t("scoreResult", { score: Math.round(lastScore!) })}
            </p>
            <p className={`mt-0.5 text-sm ${failed ? "text-red-700" : "text-emerald-700"}`}>
              {failed ? t("failedMessage") : t("passedMessage")}
            </p>
          </div>
        </div>
        {failed && (
          <button
            type="button"
            onClick={handleRetry}
            className="self-start rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {t("retryButton")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {t("progress", { current: currentIndex + 1, total: questions.length })}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-gray-900 transition-all duration-300"
          style={{ width: `${(currentIndex / questions.length) * 100}%` }}
        />
      </div>

      <div className="text-base font-medium text-gray-900 [&_p]:m-0">
        <Markdown content={currentQuestion.prompt} />
      </div>

      <div className="flex flex-col gap-2">
        {currentQuestion.choices.map((choice) => {
          const isSelected = selectedChoiceId === choice.id;
          const isCorrectChoice = correctChoiceId !== null && choice.id === correctChoiceId;
          const revealCorrect = (feedback === "correct" && isSelected) || (feedback === "incorrect" && isCorrectChoice);
          const revealWrong = feedback === "incorrect" && isSelected;
          const isDimmed = feedback !== null && !isSelected && !isCorrectChoice;
          const disabled = selectedChoiceId !== null || submitQuiz.isPending;

          const stateClasses = revealCorrect
            ? "border-emerald-500 bg-emerald-50"
            : revealWrong
              ? "border-red-500 bg-red-50"
              : isSelected
                ? "border-gray-900 bg-gray-50"
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50";

          return (
            <button
              key={choice.id}
              type="button"
              disabled={disabled}
              onClick={() => handleSelect(choice.id)}
              className={`flex items-center gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${stateClasses} ${
                isDimmed ? "opacity-60" : ""
              }`}
            >
              {choice.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={choice.image} alt="" className="h-10 w-10 shrink-0 rounded object-contain" />
              )}
              <span className="flex-1 text-gray-900 [&_p]:m-0">
                <Markdown content={choice.text} />
              </span>
              {revealCorrect && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
              {revealWrong && <X className="h-4 w-4 shrink-0 text-red-600" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
