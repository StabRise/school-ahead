"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getQuizQuestionHint, useSubmitQuiz } from "@/lib/api/browser/student-lessons/student-lessons";
import type { QuizQuestionOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Markdown } from "@/components/markdown";
import { Raccoon, type RaccoonMood } from "@/components/preschool/raccoon";
import { CelebrationScene } from "@/components/preschool/celebration-scene";
import { ScreenFrame } from "@/components/preschool/screen-frame";

const PASS_THRESHOLD_PERCENT = 60;
const HINT_DELAY_MS = 15000;
const FEEDBACK_DELAY_MS = 1600;

const CARD_COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6"];

type Feedback = "correct" | "incorrect" | null;

// One question "round" — owns its own tap/hint/feedback state, keyed by
// question id in the parent so switching questions remounts (and so
// naturally resets) it instead of an effect resetting state by hand.
function QuestionRound({
  question,
  onAnswered,
}: {
  question: QuizQuestionOut;
  onAnswered: (choiceId: number) => void;
}) {
  const t = useTranslations("PreschoolQuizGame");
  const [selectedChoiceId, setSelectedChoiceId] = useState<number | null>(null);
  const [correctChoiceId, setCorrectChoiceId] = useState<number | null>(null);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // "Stuck for too long" hint — the raccoon points at the right card.
  useEffect(() => {
    const hintTimer = window.setTimeout(async () => {
      try {
        const hint = await getQuizQuestionHint(question.id);
        setCorrectChoiceId(hint.correct_choice_id);
        setHintRevealed(true);
      } catch {
        // Hint is a nice-to-have — never block the quiz on it.
      }
    }, HINT_DELAY_MS);
    return () => window.clearTimeout(hintTimer);
  }, [question.id]);

  const handleSelect = async (choiceId: number) => {
    if (selectedChoiceId !== null) return;
    setSelectedChoiceId(choiceId);

    let correctId = correctChoiceId;
    if (correctId === null) {
      try {
        const hint = await getQuizQuestionHint(question.id);
        correctId = hint.correct_choice_id;
        setCorrectChoiceId(correctId);
      } catch {
        // If the hint call fails, still let the child move on without a
        // right/wrong flourish — the real score is graded server-side.
      }
    }
    setFeedback(correctId !== null && correctId === choiceId ? "correct" : "incorrect");
    window.setTimeout(() => onAnswered(choiceId), FEEDBACK_DELAY_MS);
  };

  const raccoonMood: RaccoonMood =
    feedback === "correct" ? "happy" : feedback === "incorrect" ? "sad" : hintRevealed ? "hint" : "idle";

  return (
    <>
      <div className="w-full rounded-[2rem] bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-300 px-6 py-5 text-center shadow-xl">
        <div className="text-lg font-extrabold text-white [&_p]:m-0 [&_strong]:text-white">
          <Markdown content={question.prompt} />
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        {question.choices.map((choice, index) => {
          const isSelected = selectedChoiceId === choice.id;
          const isRevealedCorrect = hintRevealed && choice.id === correctChoiceId && selectedChoiceId === null;
          const isWrongPick = feedback === "incorrect" && isSelected;
          const isRightPick = feedback === "correct" && isSelected;
          const showAsCorrect = isRightPick || (feedback === "incorrect" && choice.id === correctChoiceId);

          return (
            <button
              key={choice.id}
              type="button"
              disabled={selectedChoiceId !== null}
              onClick={() => handleSelect(choice.id)}
              className={`flex min-h-24 items-center justify-center rounded-3xl p-4 text-center text-lg font-bold text-white shadow-lg transition-transform disabled:cursor-default ${
                selectedChoiceId === null ? "active:scale-95" : ""
              } ${isWrongPick ? "opacity-90" : ""} ${!isSelected && selectedChoiceId !== null && !showAsCorrect ? "opacity-50" : ""}`}
              style={{
                backgroundColor: CARD_COLORS[index % CARD_COLORS.length],
                outline: showAsCorrect ? "4px solid #22c55e" : isWrongPick ? "4px solid #ef4444" : undefined,
                animation: isRevealedCorrect ? "card-correct-pulse 1s ease-in-out infinite" : undefined,
              }}
            >
              <div className="[&_p]:m-0">
                <Markdown content={choice.text} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-col items-center gap-1">
        <Raccoon mood={raccoonMood} className="h-24 w-24" />
        {feedback === "correct" && <p className="text-sm font-bold text-emerald-700">{t("correctMessage")}</p>}
        {feedback === "incorrect" && <p className="text-sm font-bold text-red-600">{t("incorrectMessage")}</p>}
        {hintRevealed && feedback === null && <p className="text-sm font-bold text-amber-700">{t("hintMessage")}</p>}
      </div>
    </>
  );
}

// Step 2, "Игровая поляна" — one big banner question at a time with large
// tappable answer cards, a raccoon that cheers/droops after each tap, and a
// hint (pointing at the right card) if the child is stuck for too long. See
// docs/interfaces/student/preschool/lesson.md.
export function PreschoolQuizGame({
  studentLessonId,
  questions,
  onChanged,
}: {
  studentLessonId: number;
  questions: QuizQuestionOut[];
  onChanged: () => void;
}) {
  const t = useTranslations("PreschoolQuizGame");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [lastScore, setLastScore] = useState<number | null>(null);
  const submitQuiz = useSubmitQuiz();

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const isAnswered = lastScore !== null;

  const handleAnswered = (choiceId: number) => {
    const nextAnswers = { ...answers, [currentQuestion.id]: choiceId };
    setAnswers(nextAnswers);

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
  };

  const handleRetry = () => {
    setAnswers({});
    setCurrentIndex(0);
    setLastScore(null);
  };

  const failed = isAnswered && lastScore! <= PASS_THRESHOLD_PERCENT;

  if (isAnswered) {
    if (!failed) {
      return <CelebrationScene title={t("scoreResult", { score: lastScore })} subtitle={t("passedMessage")} />;
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
        <ScreenFrame>
          <Raccoon mood="sad" className="h-28 w-28" />
          <p className="text-2xl font-extrabold text-emerald-900">{t("scoreResult", { score: lastScore })}</p>
          <p className="text-base text-red-700">{t("failedMessage")}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-full bg-amber-400 px-6 py-3 text-lg font-bold text-amber-950 shadow-lg transition-transform active:scale-95"
          >
            {t("retryButton")}
          </button>
        </ScreenFrame>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
      <ScreenFrame>
        <span className="text-sm font-bold text-emerald-900/70">
          {t("progress", { current: currentIndex + 1, total: questions.length })}
        </span>
        <QuestionRound key={currentQuestion.id} question={currentQuestion} onAnswered={handleAnswered} />
      </ScreenFrame>
    </div>
  );
}
