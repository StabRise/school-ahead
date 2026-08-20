"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSubmitQuiz } from "@/lib/api/browser/student-lessons/student-lessons";
import type { QuizQuestionOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Markdown } from "@/components/markdown";

const PASS_THRESHOLD_PERCENT = 60;

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
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [lastScore, setLastScore] = useState<number | null>(null);
  const submitQuiz = useSubmitQuiz();

  const allAnswered = questions.every((q) => answers[q.id] !== undefined);

  const handleSubmit = () => {
    submitQuiz.mutate(
      { studentLessonId, data: { answers } },
      {
        onSuccess: (result) => {
          setLastScore(result.score_percent);
          onChanged();
        },
      },
    );
  };

  const failed = lastScore !== null && lastScore <= PASS_THRESHOLD_PERCENT;

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{t("title")}</h3>

      {questions.map((question) => (
        <fieldset key={question.id} className="flex flex-col gap-2">
          <legend className="text-sm font-medium">
            <Markdown content={question.prompt} />
          </legend>
          {question.choices.map((choice) => (
            <label key={choice.id} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name={`question-${question.id}`}
                checked={answers[question.id] === choice.id}
                onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: choice.id }))}
                className="mt-1"
              />
              <Markdown content={choice.text} />
            </label>
          ))}
        </fieldset>
      ))}

      <button
        type="button"
        disabled={!allAnswered || submitQuiz.isPending}
        onClick={handleSubmit}
        className="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {t("submitButton")}
      </button>

      {lastScore !== null && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t("scoreResult", { score: lastScore })}</p>
          {failed ? (
            <>
              <p className="text-sm text-red-600">{t("failedMessage")}</p>
              <button
                type="button"
                onClick={() => {
                  setAnswers({});
                  setLastScore(null);
                }}
                className="self-start rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
              >
                {t("retryButton")}
              </button>
            </>
          ) : (
            <p className="text-sm text-green-700">{t("passedMessage")}</p>
          )}
        </div>
      )}
    </div>
  );
}
