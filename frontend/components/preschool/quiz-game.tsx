"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getQuizQuestionHint, useSubmitQuiz } from "@/lib/api/browser/student-lessons/student-lessons";
import type { QuizQuestionOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Markdown } from "@/components/markdown";
import { Raccoon } from "@/components/preschool/raccoon";
import { prefetchVoice, speakSequence, toSpeechText, type SpeechLanguage } from "@/lib/piper-tts";

const DEFAULT_QUIZ_LANGUAGE: SpeechLanguage = "uk";

function toSpeechLanguage(language: string): SpeechLanguage {
  return language === "en" || language === "uk" || language === "pl" ? language : DEFAULT_QUIZ_LANGUAGE;
}

const PASS_THRESHOLD_PERCENT = 60;
const HINT_DELAY_MS = 15000;
const FEEDBACK_DELAY_MS = 1600;

// Pastel fill + a darker border of the same hue, per answer card.
const CARD_STYLES = [
  { bg: "#86efac", border: "#16a34a" },
  { bg: "#fdba74", border: "#c2410c" },
  { bg: "#fde047", border: "#ca8a04" },
  { bg: "#bbf7d0", border: "#15803d" },
  { bg: "#7dd3fc", border: "#0284c7" },
  { bg: "#d8b4fe", border: "#7e22ce" },
  { bg: "#f9a8d4", border: "#db2777" },
];

type Feedback = "correct" | "incorrect" | null;

// The white, rounded "quiz card" every screen of the game lives inside — the
// question banner, the pass/fail result — so the whole game reads as one
// consistent surface. It's near the full width of the screen so a row of
// answers fits on one line on a wide screen and wraps on a narrow one. See
// docs/interfaces/student/preschool/lesson.md.
function QuizCard({ children }: { children: React.ReactNode }) {
  return <div className="w-full overflow-hidden rounded-[2rem] bg-white shadow-2xl">{children}</div>;
}

function QuizBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-300 px-6 py-7 text-center sm:py-9">
      {children}
    </div>
  );
}

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
  const speechLanguage = toSpeechLanguage(question.language);

  // "Stuck for too long" hint — the correct card starts pulsing.
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

  // Warms the voice model cache as soon as the question is shown, so tapping
  // the read-aloud button doesn't stall on a multi-megabyte download.
  useEffect(() => {
    void prefetchVoice(speechLanguage);
  }, [speechLanguage]);

  const handleReadAloud = () => {
    const texts = [question.prompt, ...question.choices.map((choice) => choice.text)].map(toSpeechText);
    void speakSequence(texts, speechLanguage);
  };

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

  return (
    <>
      <QuizBanner>
        <button
          type="button"
          aria-label={t("readAloudButton")}
          onClick={handleReadAloud}
          className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-xl shadow-md transition-transform active:scale-95"
        >
          🔊
        </button>
        <div className="text-xl font-extrabold uppercase text-gray-900 [&_p]:m-0 [&_p]:text-xl sm:[&_p]:text-2xl md:[&_p]:text-3xl lg:[&_p]:text-4xl">
          <Markdown content={question.prompt} />
        </div>
      </QuizBanner>

      {/* `relative` so the post-answer raccoon can overlay this area instead
          of adding height below it — an added block there used to make the
          whole card grow/shrink as the child answered each question. */}
      <div className="relative">
        <div className="flex flex-wrap justify-center gap-4 p-6">
          {question.choices.map((choice, index) => {
            const style = CARD_STYLES[index % CARD_STYLES.length];
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
                className={`flex min-w-40 flex-none flex-col items-center justify-center gap-2 rounded-2xl border-4 px-6 py-4 text-center text-lg font-extrabold uppercase text-gray-900 shadow-md transition-transform disabled:cursor-default sm:min-w-48 sm:px-8 sm:py-5 sm:text-xl md:px-10 md:py-6 md:text-2xl lg:text-3xl ${
                  selectedChoiceId === null ? "active:scale-95" : ""
                } ${isWrongPick ? "opacity-90" : ""} ${!isSelected && selectedChoiceId !== null && !showAsCorrect ? "opacity-50" : ""}`}
                style={{
                  backgroundColor: style.bg,
                  borderColor: showAsCorrect ? "#16a34a" : isWrongPick ? "#dc2626" : style.border,
                  animation: isRevealedCorrect ? "card-correct-pulse 1s ease-in-out infinite" : undefined,
                }}
              >
                {choice.image && (
                  <img src={choice.image} alt="" className="h-16 w-16 object-contain sm:h-20 sm:w-20 md:h-24 md:w-24" />
                )}
                <div className="[&_p]:m-0 [&_p]:text-lg sm:[&_p]:text-xl md:[&_p]:text-2xl lg:[&_p]:text-3xl">
                  <Markdown content={choice.text} />
                </div>
              </button>
            );
          })}
        </div>

        {/* The raccoon only shows up once the child has actually tapped an
            answer — cheering or drooping, on top of the grid, never while
            they're still deciding. */}
        {feedback && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-b-[2rem] bg-white/85 backdrop-blur-sm">
            <Raccoon mood={feedback === "correct" ? "happy" : "sad"} className="h-24 w-24" />
            {feedback === "correct" && <p className="text-sm font-bold text-emerald-700">{t("correctMessage")}</p>}
            {feedback === "incorrect" && <p className="text-sm font-bold text-red-600">{t("incorrectMessage")}</p>}
          </div>
        )}
      </div>
    </>
  );
}

// Step 2, "Игровая поляна" — one big banner question at a time with large
// tappable answer cards, and a raccoon that cheers/droops once the child
// taps an answer. See docs/interfaces/student/preschool/lesson.md.
export function PreschoolQuizGame({
  studentLessonId,
  questions,
  onChanged,
  onBackToMaterials,
}: {
  studentLessonId: number;
  questions: QuizQuestionOut[];
  onChanged: () => void;
  onBackToMaterials: () => void;
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
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-3">
        <QuizCard>
          <QuizBanner>
            <p className="text-xl font-extrabold uppercase text-gray-900 sm:text-2xl md:text-3xl lg:text-4xl">
              {t("scoreResult", { score: lastScore })}
            </p>
          </QuizBanner>
          <div className="flex flex-col items-center gap-3 px-6 py-8">
            <Raccoon mood={failed ? "sad" : "happy"} className="h-28 w-28" />
            <p className={failed ? "text-base text-red-700" : "text-lg font-bold text-emerald-700"}>
              {failed ? t("failedMessage") : t("passedMessage")}
            </p>
            {failed && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onBackToMaterials}
                  className="rounded-full bg-white px-6 py-3 text-lg font-bold text-emerald-800 shadow-lg ring-2 ring-inset ring-emerald-300 transition-transform active:scale-95"
                >
                  {t("backToMaterialsButton")}
                </button>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="rounded-full bg-amber-400 px-6 py-3 text-lg font-bold text-amber-950 shadow-lg transition-transform active:scale-95"
                >
                  {t("retryButton")}
                </button>
              </div>
            )}
          </div>
        </QuizCard>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-3">
      <QuizCard>
        <p className="px-6 pt-6 pb-2 text-center text-sm font-bold text-emerald-900 sm:text-base md:text-lg">
          {t("progress", { current: currentIndex + 1, total: questions.length })}
        </p>
        <QuestionRound key={currentQuestion.id} question={currentQuestion} onAnswered={handleAnswered} />
      </QuizCard>
    </div>
  );
}
