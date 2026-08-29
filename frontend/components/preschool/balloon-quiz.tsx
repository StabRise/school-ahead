"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { speak, type SpeechLanguage as GameLanguage } from "@/lib/piper-tts";

// Bonus quiz opened by popping the heart-shaped "?" balloon in
// balloon-pop-game.tsx. Purely client-side and ephemeral (no backend lesson
// record) — a lightweight counting exercise for the "numbers10" mode, built
// from scratch rather than reusing components/preschool/quiz-game.tsx, which
// is tightly coupled to a real StudentLesson's QuizQuestion data. Visual
// language borrows from that component and theory-check.tsx (gradient
// banner, rounded-[2rem] white card, bold border-4 answer buttons).

export type BalloonQuizAnimal = "cat" | "dog" | "monkey";

export interface BalloonQuizQuestion {
  animal: BalloonQuizAnimal;
  emojis: string[];
  options: number[];
  correctAnswer: number;
}

const QUESTION_COUNT = 5;
// Strictly greater than 60% — 4/6 (~66.7%) passes, 3/6 (50%) doesn't.
const PASS_RATIO = 0.6;
const MIN_EMOJIS = 3;
const MAX_EMOJIS = 6;
const FEEDBACK_DELAY_MS = 1200;

const ANIMAL_EMOJI: Record<BalloonQuizAnimal, string> = {
  cat: "🐱",
  dog: "🐶",
  monkey: "🐵",
};

const ANIMALS: BalloonQuizAnimal[] = ["cat", "dog", "monkey"];

function randomInt(minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(Math.random() * (maxInclusive - minInclusive + 1));
}

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 4 multiple-choice numbers: the correct count plus 3 distinct, plausible
// wrong ones nearby (falls back to random values in range if the count is
// too close to the ends of [0, total] for every +/-1..3 offset to be
// in-bounds — never happens given MIN_EMOJIS/MAX_EMOJIS, but kept safe).
function buildOptions(correct: number, total: number): number[] {
  const candidates = new Set<number>([correct]);
  const offsets = [1, -1, 2, -2, 3, -3];
  for (const offset of offsets) {
    if (candidates.size >= 4) break;
    const value = correct + offset;
    if (value >= 0 && value <= total) candidates.add(value);
  }
  while (candidates.size < Math.min(4, total + 1)) {
    candidates.add(randomInt(0, total));
  }
  return shuffle([...candidates]);
}

function buildQuestion(): BalloonQuizQuestion {
  const total = randomInt(MIN_EMOJIS, MAX_EMOJIS);
  const animal = randomFrom(ANIMALS);
  const otherAnimals = ANIMALS.filter((a) => a !== animal);
  const targetCount = randomInt(0, total);

  const emojis: string[] = [];
  for (let i = 0; i < targetCount; i++) emojis.push(ANIMAL_EMOJI[animal]);
  for (let i = targetCount; i < total; i++) emojis.push(ANIMAL_EMOJI[randomFrom(otherAnimals)]);

  return {
    animal,
    emojis: shuffle(emojis),
    options: buildOptions(targetCount, total),
    correctAnswer: targetCount,
  };
}

export function buildBalloonQuizQuestions(): BalloonQuizQuestion[] {
  return Array.from({ length: QUESTION_COUNT }, buildQuestion);
}

// "How many {animal} do you see?" per game language, with the animal name
// already in the grammatical case/number each template needs (e.g. genitive
// plural for uk/pl) rather than naive string interpolation.
const ANIMAL_NAMES: Record<GameLanguage, Record<BalloonQuizAnimal, string>> = {
  en: { cat: "cats", dog: "dogs", monkey: "monkeys" },
  uk: { cat: "котів", dog: "собак", monkey: "мавп" },
  pl: { cat: "kotów", dog: "psów", monkey: "małp" },
};

const QUESTION_TEMPLATE: Record<GameLanguage, (animalName: string) => string> = {
  en: (animalName) => `How many ${animalName} do you see?`,
  uk: (animalName) => `Скільки ${animalName} ти бачиш?`,
  pl: (animalName) => `Ile ${animalName} widzisz?`,
};

function questionText(animal: BalloonQuizAnimal, language: GameLanguage): string {
  return QUESTION_TEMPLATE[language](ANIMAL_NAMES[language][animal]);
}

const OPTION_STYLES = [
  "border-sky-400 bg-sky-50 text-sky-900",
  "border-amber-400 bg-amber-50 text-amber-900",
  "border-emerald-400 bg-emerald-50 text-emerald-900",
  "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-900",
];

export function BalloonQuiz({
  questions,
  language,
  muted,
  onFinish,
}: {
  questions: BalloonQuizQuestion[];
  language: GameLanguage;
  muted: boolean;
  onFinish: (passed: boolean) => void;
}) {
  const t = useTranslations("BalloonPopQuiz");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const finished = currentIndex >= questions.length;
  const passed = finished && correctCount / questions.length > PASS_RATIO;

  // Reads each question aloud the instant it's shown — including the first,
  // since this effect also runs on mount.
  useEffect(() => {
    if (muted || finished) return;
    speak(questionText(questions[currentIndex].animal, language), language, "sentence");
  }, [currentIndex, finished, questions, language, muted]);

  const handleSelect = (option: number) => {
    if (selected !== null) return;
    setSelected(option);
    const question = questions[currentIndex];
    const isCorrect = option === question.correctAnswer;
    if (isCorrect) setCorrectCount((current) => current + 1);
    setTimeout(() => {
      setSelected(null);
      setCurrentIndex((current) => current + 1);
    }, FEEDBACK_DELAY_MS);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="relative bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-300 px-6 py-7 text-center">
          <span className="text-4xl" aria-hidden="true">
            💖
          </span>
          <p className="mt-1 text-lg font-extrabold text-white drop-shadow sm:text-xl">{t("title")}</p>
        </div>

        {!finished ? (
          <div className="flex flex-col gap-5 p-6">
            <p className="text-center text-sm font-bold text-emerald-900 sm:text-base">
              {t("progress", { current: currentIndex + 1, total: questions.length })}
            </p>
            <p className="text-center text-lg font-bold text-gray-800 sm:text-xl">
              {questionText(questions[currentIndex].animal, language)}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-gray-50 p-4 text-3xl sm:text-4xl">
              {questions[currentIndex].emojis.map((emoji, i) => (
                <span key={i} aria-hidden="true">
                  {emoji}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {questions[currentIndex].options.map((option, i) => {
                const isPicked = selected === option;
                const isCorrectOption = option === questions[currentIndex].correctAnswer;
                const revealed = selected !== null && (isPicked || isCorrectOption);
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={selected !== null}
                    onClick={() => handleSelect(option)}
                    className={`rounded-2xl border-4 py-4 text-2xl font-extrabold transition-transform active:scale-95 disabled:active:scale-100 ${
                      revealed
                        ? isCorrectOption
                          ? "border-emerald-500 bg-emerald-100 text-emerald-900"
                          : "border-rose-500 bg-rose-100 text-rose-900"
                        : OPTION_STYLES[i % OPTION_STYLES.length]
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {selected !== null && (
              <p className="text-center text-base font-bold text-gray-700" role="status">
                {selected === questions[currentIndex].correctAnswer ? t("correct") : t("incorrect")}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 p-6 text-center">
            <span className="text-5xl" aria-hidden="true">
              {passed ? "🎉" : "💪"}
            </span>
            <p className="text-xl font-extrabold text-gray-800">{passed ? t("passedTitle") : t("failedTitle")}</p>
            <p className="text-base text-gray-600">{t("scoreResult", { correct: correctCount, total: questions.length })}</p>
            <p className="text-base font-semibold text-gray-700">
              {passed ? t("passedMessage") : t("failedMessage")}
            </p>
            <button
              type="button"
              onClick={() => onFinish(passed)}
              className="mt-2 rounded-full bg-emerald-500 px-8 py-3 text-lg font-bold text-white shadow-lg transition-transform active:scale-95"
            >
              {t("continueButton")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
