"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, XCircle } from "lucide-react";
import { getQuizQuestionHint, useSubmitQuiz } from "@/lib/api/browser/student-lessons/student-lessons";
import type { QuizQuestionOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Markdown } from "@/components/markdown";
import { QuizAnswerButton, QuizBanner, QuizCard, QuizChoiceContent, QuizFeedbackOverlay } from "@/components/quiz-ui";

const PASS_THRESHOLD_PERCENT = 60;
// Long enough for the student to read whether they got it right before the
// quiz moves on to the next question.
const FEEDBACK_DELAY_MS = 1600;

type Feedback = "correct" | "incorrect" | null;

// One question at a time in the same big-card format as the preschool quiz
// (components/preschool/quiz-game.tsx) and the balloon-pop bonus quiz
// (components/preschool/balloon-quiz.tsx) — answering a question reveals
// whether it was right, then advances to the next, all the way through the
// last one (which submits the quiz). See docs/interfaces/student/lesson.md.
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
      <QuizCard>
        <QuizBanner>
          <p className="text-xl font-extrabold text-white drop-shadow sm:text-2xl">{t("scoreResult", { score: lastScore })}</p>
        </QuizBanner>
        <div className="flex flex-col items-center gap-3 px-6 py-8">
          {failed ? <XCircle className="h-16 w-16 text-red-500" /> : <CheckCircle2 className="h-16 w-16 text-emerald-500" />}
          <p className={failed ? "text-base text-red-700" : "text-lg font-bold text-emerald-700"}>
            {failed ? t("failedMessage") : t("passedMessage")}
          </p>
          {failed && (
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-full bg-amber-400 px-6 py-3 text-lg font-bold text-amber-950 shadow-lg transition-transform active:scale-95"
            >
              {t("retryButton")}
            </button>
          )}
        </div>
      </QuizCard>
    );
  }

  return (
    <QuizCard>
      <p className="px-6 pt-6 pb-2 text-center text-sm font-bold text-gray-500">
        {t("progress", { current: currentIndex + 1, total: questions.length })}
      </p>
      <QuizBanner>
        <div className="text-lg font-extrabold text-white drop-shadow [&_p]:m-0 [&_p]:text-lg sm:[&_p]:text-xl">
          <Markdown content={currentQuestion.prompt} />
        </div>
      </QuizBanner>

      <div className="relative">
        <div className="flex flex-wrap justify-center gap-4 p-6">
          {currentQuestion.choices.map((choice, index) => {
            const isSelected = selectedChoiceId === choice.id;
            const isWrongPick = feedback === "incorrect" && isSelected;
            const isRightPick = feedback === "correct" && isSelected;
            const showAsCorrect = isRightPick || (feedback === "incorrect" && choice.id === correctChoiceId);
            const isDimmed = !isSelected && selectedChoiceId !== null && !showAsCorrect;
            const status = showAsCorrect ? "correct" : isWrongPick ? "incorrect" : isDimmed ? "dimmed" : "default";

            return (
              <QuizAnswerButton
                key={choice.id}
                index={index}
                status={status}
                disabled={selectedChoiceId !== null || submitQuiz.isPending}
                onClick={() => handleSelect(choice.id)}
              >
                <QuizChoiceContent image={choice.image}>
                  <Markdown content={choice.text} />
                </QuizChoiceContent>
              </QuizAnswerButton>
            );
          })}
        </div>

        {feedback && (
          <QuizFeedbackOverlay
            mascot={
              feedback === "correct" ? (
                <CheckCircle2 className="h-16 w-16 text-emerald-500" />
              ) : (
                <XCircle className="h-16 w-16 text-red-500" />
              )
            }
          />
        )}
      </div>
    </QuizCard>
  );
}
