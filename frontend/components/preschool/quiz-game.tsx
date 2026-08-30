"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getQuizQuestionHint, useSubmitQuiz } from "@/lib/api/browser/student-lessons/student-lessons";
import type { QuizQuestionOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Markdown } from "@/components/markdown";
import { Raccoon } from "@/components/preschool/raccoon";
import { prefetchVoice, speakSequence, toSpeechText, type SpeechLanguage } from "@/lib/piper-tts";
import {
  QuizAnswerButton,
  QuizBanner,
  QuizCard,
  QuizChoiceContent,
  QuizFeedbackOverlay,
  QuizReadAloudButton,
} from "@/components/quiz-ui";

const DEFAULT_QUIZ_LANGUAGE: SpeechLanguage = "uk";

function toSpeechLanguage(language: string): SpeechLanguage {
  return language === "en" || language === "uk" || language === "pl" ? language : DEFAULT_QUIZ_LANGUAGE;
}

const PASS_THRESHOLD_PERCENT = 60;
const HINT_DELAY_MS = 15000;
const FEEDBACK_DELAY_MS = 1600;

type Feedback = "correct" | "incorrect" | null;

// One question "round" — owns its own tap/hint/feedback state, keyed by
// question id in the parent so switching questions remounts (and so
// naturally resets) it instead of an effect resetting state by hand.
function QuestionRound({
  question,
  progress,
  onAnswered,
}: {
  question: QuizQuestionOut;
  progress: React.ReactNode;
  onAnswered: (choiceId: number) => void;
}) {
  const t = useTranslations("PreschoolQuizGame");
  const [selectedChoiceId, setSelectedChoiceId] = useState<number | null>(null);
  const [correctChoiceId, setCorrectChoiceId] = useState<number | null>(null);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  // Index into [prompt, ...choices] of the utterance currently playing via
  // the read-aloud button — 0 is the question, 1+ maps to choices[index-1].
  // null while nothing is playing.
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
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
    void speakSequence(texts, speechLanguage, setSpeakingIndex);
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
      <p className="text-center text-sm font-bold my-2 text-gray-900/70 sm:text-base">{progress}</p>

      <QuizBanner>
        <div className="flex items-center mt-4 justify-center gap-2">
          <div className="text-center text-xl font-extrabold uppercase text-gray-900 [&_p]:m-0 [&_p]:text-xl sm:[&_p]:text-2xl">
            <Markdown content={question.prompt} />
          </div>
          <QuizReadAloudButton label={t("readAloudButton")} onClick={handleReadAloud} />
        </div>
      </QuizBanner>

      {/* `relative` so the post-answer raccoon can overlay this area instead
          of adding height below it — an added block there used to make the
          whole card grow/shrink as the child answered each question. */}
      <div className="relative">
        <div className="flex flex-wrap justify-center gap-4 p-6">
          {question.choices.map((choice, index) => {
            const isSelected = selectedChoiceId === choice.id;
            const isRevealedCorrect = hintRevealed && choice.id === correctChoiceId && selectedChoiceId === null;
            const isWrongPick = feedback === "incorrect" && isSelected;
            const isRightPick = feedback === "correct" && isSelected;
            const showAsCorrect = isRightPick || (feedback === "incorrect" && choice.id === correctChoiceId);
            const isDimmed = !isSelected && selectedChoiceId !== null && !showAsCorrect;
            // texts[0] is the question prompt, so this choice is texts[index + 1].
            const isSpeaking = speakingIndex === index + 1;

            const status = showAsCorrect ? "correct" : isWrongPick ? "incorrect" : isDimmed ? "dimmed" : "default";
            const pulse = isRevealedCorrect ? "hint" : isSpeaking ? "speaking" : undefined;

            return (
              <QuizAnswerButton
                key={choice.id}
                index={index}
                status={status}
                pulse={pulse}
                disabled={selectedChoiceId !== null}
                onClick={() => handleSelect(choice.id)}
              >
                <QuizChoiceContent image={choice.image}>
                  <Markdown content={choice.text} />
                </QuizChoiceContent>
              </QuizAnswerButton>
            );
          })}
        </div>

        {/* The raccoon only shows up once the child has actually tapped an
            answer — cheering or drooping, on top of the grid, never while
            they're still deciding. */}
        {feedback && (
          <QuizFeedbackOverlay
            mascot={<Raccoon mood={feedback === "correct" ? "happy" : "sad"} className="h-24 w-24" />}
            message={
              feedback === "correct" ? (
                <p className="text-sm font-bold text-emerald-700">{t("correctMessage")}</p>
              ) : (
                <p className="text-sm font-bold text-red-600">{t("incorrectMessage")}</p>
              )
            }
          />
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-lg">
          <QuizCard>
            <QuizBanner>
              <p className="text-xl font-extrabold uppercase text-gray-900 sm:text-2xl">
                {t("scoreResult", { score: Math.round(lastScore!) })}
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
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg">
        <QuizCard>
          <QuestionRound
            key={currentQuestion.id}
            question={currentQuestion}
            progress={t("progress", { current: currentIndex + 1, total: questions.length })}
            onAnswered={handleAnswered}
          />
        </QuizCard>
      </div>
    </div>
  );
}
