"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSubmitQuiz } from "@/lib/api/browser/student-lessons/student-lessons";
import type { QuizQuestionOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Markdown } from "@/components/markdown";

const PASS_THRESHOLD_PERCENT = 60;
// Brief pause so the student sees their tap register before the quiz moves
// on — long enough to read as feedback, short enough not to feel laggy.
const ADVANCE_DELAY_MS = 350;

// One question at a time — answering a question immediately advances to the
// next, all the way through the last one (which submits the quiz). Shared by
// both interface modes (regular and preschool) since they render the same
// lesson wizard. See docs/interfaces/student/preschool/lesson.md.
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
  const [lastScore, setLastScore] = useState<number | null>(null);
  const submitQuiz = useSubmitQuiz();

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const isAnswered = lastScore !== null;

  const handleSelect = (choiceId: number) => {
    if (selectedChoiceId !== null || submitQuiz.isPending) return;

    setSelectedChoiceId(choiceId);
    const nextAnswers = { ...answers, [currentQuestion.id]: choiceId };
    setAnswers(nextAnswers);

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
    }, ADVANCE_DELAY_MS);
  };

  const handleRetry = () => {
    setAnswers({});
    setSelectedChoiceId(null);
    setCurrentIndex(0);
    setLastScore(null);
  };

  const failed = isAnswered && lastScore! <= PASS_THRESHOLD_PERCENT;

  if (isAnswered) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">{t("title")}</h3>
        <p className="text-sm font-medium">{t("scoreResult", { score: lastScore })}</p>
        {failed ? (
          <>
            <p className="text-sm text-red-600">{t("failedMessage")}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="self-start rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
            >
              {t("retryButton")}
            </button>
          </>
        ) : (
          <p className="text-sm text-green-700">{t("passedMessage")}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("title")}</h3>
        <span className="text-xs font-medium text-gray-500">
          {t("progress", { current: currentIndex + 1, total: questions.length })}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-gray-900 transition-all duration-300"
          style={{ width: `${(currentIndex / questions.length) * 100}%` }}
        />
      </div>

      <fieldset key={currentQuestion.id} className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          <Markdown content={currentQuestion.prompt} />
        </legend>
        {currentQuestion.choices.map((choice) => {
          const isSelected = selectedChoiceId === choice.id;
          const isDisabled = selectedChoiceId !== null || submitQuiz.isPending;
          return (
            <label
              key={choice.id}
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                isSelected ? "border-gray-900 bg-gray-900/5" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              } ${isDisabled ? "cursor-default" : "cursor-pointer"}`}
            >
              <input
                type="radio"
                name={`question-${currentQuestion.id}`}
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => handleSelect(choice.id)}
                className="mt-1"
              />
              {choice.image ? (
                <div className="flex flex-col gap-1">
                  <img src={choice.image} alt="" className="h-16 w-16 object-contain" />
                  <Markdown content={choice.text} />
                </div>
              ) : (
                <Markdown content={choice.text} />
              )}
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
