"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { speak, type SpeechLanguage as GameLanguage } from "@/lib/piper-tts";
import type { BalloonMode } from "@/stores/balloon-pop-game-store";
import { QuizAnswerButton, QuizBanner, QuizCard, QuizFeedbackOverlay, QuizReadAloudButton } from "@/components/quiz-ui";

// Bonus quiz opened by popping the heart-shaped "?" balloon in
// balloon-pop-game.tsx. Purely client-side and ephemeral (no backend lesson
// record), built from scratch rather than reusing components/preschool/
// quiz-game.tsx, which is tightly coupled to a real StudentLesson's
// QuizQuestion data. Visual language borrows from that component and
// theory-check.tsx (gradient banner, rounded-[2rem] white card, bold
// border-4 answer buttons). Two question kinds, one per quiz-enabled mode
// (see QUIZ_BALLOON_MODES in balloon-pop-game.tsx):
// - "counting" ("numbers10"): "how many cats do you see?" over a row of
//   mixed animal emojis, answered by picking a number.
// - "picture" ("animalsEx"/"schoolSuppliesEx"/"family"/"bodyParts"/
//   "fruits", see PICTURE_QUIZ_MODES below): "where is the X?" answered by
//   picking the matching illustration out of a few from that mode's image
//   list (BALLOON_ANIMALS_EX/BALLOON_SCHOOL_SUPPLIES_EX/BALLOON_FAMILY/
//   BALLOON_BODY_PARTS/BALLOON_FRUITS).

export type BalloonQuizAnimal = "cat" | "dog" | "monkey";

interface CountingQuestion {
  kind: "counting";
  animal: BalloonQuizAnimal;
  emojis: string[];
  options: number[];
  correctAnswer: number;
}

export interface BalloonQuizAnimalChoice {
  name: string;
  image: string;
}

interface PictureQuestion {
  kind: "picture";
  target: BalloonQuizAnimalChoice;
  choices: BalloonQuizAnimalChoice[];
  correctIndex: number;
}

export type BalloonQuizQuestion = CountingQuestion | PictureQuestion;

const QUESTION_COUNT = 6;
// Strictly greater than 60% — 4/6 (~66.7%) passes, 3/6 (50%) doesn't.
const PASS_RATIO = 0.6;
const MIN_EMOJIS = 3;
const MAX_EMOJIS = 8;
const MAX_PICTURE_CHOICES = 4;
const FEEDBACK_DELAY_MS = 1500;

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

function buildCountingQuestion(): CountingQuestion {
  const total = randomInt(MIN_EMOJIS, MAX_EMOJIS);
  const animal = randomFrom(ANIMALS);
  const otherAnimals = ANIMALS.filter((a) => a !== animal);
  const targetCount = randomInt(0, total);

  const emojis: string[] = [];
  for (let i = 0; i < targetCount; i++) emojis.push(ANIMAL_EMOJI[animal]);
  for (let i = targetCount; i < total; i++) emojis.push(ANIMAL_EMOJI[randomFrom(otherAnimals)]);

  return {
    kind: "counting",
    animal,
    emojis: shuffle(emojis),
    options: buildOptions(targetCount, total),
    correctAnswer: targetCount,
  };
}

// Case-insensitive dedupe, keeping the first occurrence — BALLOON_ANIMALS_EX
// has a few casing duplicates (e.g. "Panda"/"panda") that would otherwise
// show up as two indistinguishable choices in the same question.
function uniqueByName(animals: BalloonQuizAnimalChoice[]): BalloonQuizAnimalChoice[] {
  const seen = new Set<string>();
  const result: BalloonQuizAnimalChoice[] = [];
  for (const animal of animals) {
    const key = animal.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(animal);
  }
  return result;
}

// `target` is passed in (rather than picked here) so buildBalloonQuizQuestions
// can hand out a distinct target per question — see pickUniqueTargets.
function buildPictureQuestion(pool: BalloonQuizAnimalChoice[], target: BalloonQuizAnimalChoice): PictureQuestion {
  const distractorPool = pool.filter((a) => a.name.toLowerCase() !== target.name.toLowerCase());
  const distractors = shuffle(distractorPool).slice(0, Math.min(MAX_PICTURE_CHOICES - 1, distractorPool.length));
  const choices = shuffle([target, ...distractors]);
  return {
    kind: "picture",
    target,
    choices,
    correctIndex: choices.findIndex((c) => c === target),
  };
}

// One target per question, none repeated — as long as `pool` has at least
// `count` items (guaranteed by MIN_CARD_COUNT in balloon-pop-game.tsx, since
// `pool` is that mode's fixed, already-deduped subset picked at game init).
// Only wraps around (repeating a target) if the pool is smaller than
// `count`, which shouldn't happen given that guarantee.
function pickUniqueTargets(pool: BalloonQuizAnimalChoice[], count: number): BalloonQuizAnimalChoice[] {
  if (pool.length === 0) return [];
  const shuffled = shuffle(pool);
  return Array.from({ length: count }, (_, i) => shuffled[i % shuffled.length]);
}

// Modes with a picture quiz — everything else falls back to the counting
// quiz. `picturePool` (that mode's BALLOON_ANIMALS_EX/BALLOON_SCHOOL_
// SUPPLIES_EX/BALLOON_FAMILY) is passed in by the caller rather than
// imported from balloon-pop-game.tsx (which already imports this module) to
// avoid a circular import — ignored for modes that don't need one.
const PICTURE_QUIZ_MODES: BalloonMode[] = ["animalsEx", "schoolSuppliesEx", "family", "bodyParts", "fruits"];

export function buildBalloonQuizQuestions(
  mode: BalloonMode,
  picturePool: BalloonQuizAnimalChoice[],
): BalloonQuizQuestion[] {
  if (PICTURE_QUIZ_MODES.includes(mode)) {
    const pool = uniqueByName(picturePool);
    const targets = pickUniqueTargets(pool, QUESTION_COUNT);
    return targets.map((target) => buildPictureQuestion(pool, target));
  }
  return Array.from({ length: QUESTION_COUNT }, buildCountingQuestion);
}

// "How many {animal} do you see?" per game language, with the animal name
// already in the grammatical case/number each template needs (e.g. genitive
// plural for uk/pl) rather than naive string interpolation.
const ANIMAL_NAMES: Record<GameLanguage, Record<BalloonQuizAnimal, string>> = {
  en: { cat: "cats", dog: "dogs", monkey: "monkeys" },
  uk: { cat: "котів", dog: "собак", monkey: "мавп" },
  pl: { cat: "kotów", dog: "psów", monkey: "małp" },
};

const COUNTING_QUESTION_TEMPLATE: Record<GameLanguage, (animalName: string) => string> = {
  en: (animalName) => `How many ${animalName} do you see?`,
  uk: (animalName) => `Скільки ${animalName} ти бачиш?`,
  pl: (animalName) => `Ile ${animalName} widzisz?`,
};

function countingQuestionText(animal: BalloonQuizAnimal, language: GameLanguage): string {
  return COUNTING_QUESTION_TEMPLATE[language](ANIMAL_NAMES[language][animal]);
}

// None of the PICTURE_QUIZ_MODES image lists have per-language variants
// (same convention as BALLOON_ANIMALS/BALLOON_GREETINGS in
// balloon-pop-game.tsx), so this stays plain English regardless of the
// selected game language.
function pictureQuestionText(targetName: string): string {
  return `Where is a ${targetName}?`;
}

function questionText(question: BalloonQuizQuestion, language: GameLanguage): string {
  return question.kind === "counting"
    ? countingQuestionText(question.animal, language)
    : pictureQuestionText(question.target.name);
}

// Cheerful two-note "ta-da" for a correct answer, and a short descending
// buzz for a wrong one — same procedural Web Audio approach as
// balloon-pop-game.tsx's playPopSound/playDiamondChime (no audio asset
// pipeline exists in this project).
function playCorrectSound() {
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    const notes = [784, 988]; // G5, B5
    notes.forEach((frequency, i) => {
      const startTime = ctx.currentTime + i * 0.12;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.3);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.32);
    });
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Best-effort only — never block feedback on audio failures.
  }
}

function playIncorrectSound() {
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(220, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.42);
    oscillator.onended = () => ctx.close();
  } catch {
    // Best-effort only — never block feedback on audio failures.
  }
}

// Rising 4-note major arpeggio for passing the whole quiz (>PASS_RATIO) —
// bigger and longer than playCorrectSound's two-note blip, since it marks
// finishing the quiz well rather than just one right answer.
function playPassSound() {
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((frequency, i) => {
      const startTime = ctx.currentTime + i * 0.11;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.4);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.42);
    });
    setTimeout(() => ctx.close(), (notes.length * 0.11 + 0.42) * 1000);
  } catch {
    // Best-effort only — never block the celebration on audio failures.
  }
}

// One flying star's random trajectory — spreads out and up from the mascot,
// like a small firework. Computed once per star (see CelebrationStars) so
// it doesn't re-randomize on every render.
interface StarBurst {
  id: number;
  dx: number;
  dy: number;
  rotate: number;
  delay: number;
}

const CELEBRATION_STAR_COUNT = 14;

function buildStarBursts(): StarBurst[] {
  return Array.from({ length: CELEBRATION_STAR_COUNT }, (_, id) => {
    const angle = Math.random() * Math.PI - Math.PI / 2 - Math.PI / 4; // upward arc, ±90° off straight up
    const distance = 90 + Math.random() * 90;
    return {
      id,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      rotate: Math.random() * 360 - 180,
      delay: Math.random() * 0.3,
    };
  });
}

// Bursts of ⭐ flying outward from the mascot on the pass screen — see
// celebration-star-fly in app/globals.css. Purely decorative (aria-hidden);
// the pass/fail message itself is read by the parent's own text.
function CelebrationStars() {
  const [stars] = useState(buildStarBursts);
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      {stars.map((star) => (
        <span
          key={star.id}
          className="absolute text-2xl"
          style={
            {
              animation: `celebration-star-fly 1.1s ease-out ${star.delay}s forwards`,
              "--dx": `${star.dx}px`,
              "--dy": `${star.dy}px`,
              "--rotate": `${star.rotate}deg`,
            } as React.CSSProperties
          }
        >
          ⭐
        </span>
      ))}
    </div>
  );
}

// Final-screen mascot — grows with the score rather than a flat pass/fail
// icon: still hatching at the low end, up through a fire-breathing dragon,
// to a wise graduate owl at the top. Independent of PASS_RATIO (the diamond
// reward threshold in balloon-pop-game.tsx) — this is just encouragement,
// not the pass/fail signal.
function mascotForScore(correctCount: number): string {
  if (correctCount <= 2) return "/preschool/quiz/chicken.jpeg";
  if (correctCount <= 4) return "/preschool/quiz/dragon.jpeg";
  return "/preschool/quiz/owl.jpeg";
}

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
  const question = finished ? null : questions[currentIndex];

  // Reads each question aloud the instant it's shown — including the first,
  // since this effect also runs on mount.
  useEffect(() => {
    if (muted || !question) return;
    speak(questionText(question, language), language, "sentence");
    // `question` is derived from `questions`/`currentIndex` every render, so
    // depending on it directly would refire this on every render — depend on
    // its actual identity-changing inputs instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, questions, language, muted]);

  // Fires once, the instant the finish screen appears with a passing score
  // — `finished`/`passed` are derived from currentIndex/correctCount and
  // never flip back once true, so this can't re-trigger on later re-renders.
  useEffect(() => {
    if (finished && passed && !muted) playPassSound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, passed]);

  const isCorrectValue = (q: BalloonQuizQuestion, value: number) =>
    q.kind === "counting" ? value === q.correctAnswer : value === q.correctIndex;

  const handleSelect = (value: number) => {
    if (selected !== null || !question) return;
    setSelected(value);
    const correct = isCorrectValue(question, value);
    if (correct) setCorrectCount((current) => current + 1);
    if (!muted) (correct ? playCorrectSound : playIncorrectSound)();
    setTimeout(() => {
      setSelected(null);
      setCurrentIndex((current) => current + 1);
    }, FEEDBACK_DELAY_MS);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg">
        <QuizCard>
          <QuizBanner>
            <QuizReadAloudButton
              label={t("readAloudButton")}
              onClick={() => question && speak(questionText(question, language), language, "sentence")}
            />
            <p className="text-sm font-bold text-white drop-shadow sm:text-base">{t("title")}</p>
          </QuizBanner>

          {question ? (
            <div className="relative flex flex-col gap-5 p-6">
              <p className="text-center text-sm font-bold text-emerald-900 sm:text-base">
                {t("progress", { current: currentIndex + 1, total: questions.length })}
              </p>
              <p className="text-center text-lg font-bold text-gray-800 sm:text-xl">
                {questionText(question, language)}
              </p>

              {question.kind === "counting" ? (
                <>
                  <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-gray-50 p-4 text-3xl sm:text-4xl">
                    {question.emojis.map((emoji, i) => (
                      <span key={i} aria-hidden="true">
                        {emoji}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {question.options.map((option, i) => {
                      const isPicked = selected === option;
                      const isCorrectOption = option === question.correctAnswer;
                      const revealed = selected !== null && (isPicked || isCorrectOption);
                      const isDimmed = selected !== null && !revealed;
                      const status = revealed ? (isCorrectOption ? "correct" : "incorrect") : isDimmed ? "dimmed" : "default";
                      return (
                        <QuizAnswerButton
                          key={option}
                          index={i}
                          status={status}
                          disabled={selected !== null}
                          onClick={() => handleSelect(option)}
                          className="py-4 text-2xl font-extrabold text-gray-900"
                        >
                          {option}
                        </QuizAnswerButton>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {question.choices.map((choice, i) => {
                    const isPicked = selected === i;
                    const isCorrectChoice = i === question.correctIndex;
                    const revealed = selected !== null && (isPicked || isCorrectChoice);
                    const isDimmed = selected !== null && !revealed;
                    const status = revealed ? (isCorrectChoice ? "correct" : "incorrect") : isDimmed ? "dimmed" : "default";
                    return (
                      <QuizAnswerButton
                        key={`${choice.name}-${i}`}
                        index={i}
                        status={status}
                        disabled={selected !== null}
                        onClick={() => handleSelect(i)}
                        className="overflow-hidden p-1"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={choice.image} alt="" className="aspect-square w-full rounded-xl object-cover" />
                      </QuizAnswerButton>
                    );
                  })}
                </div>
              )}

              {selected !== null && (
                <QuizFeedbackOverlay
                  roundedClassName="rounded-[2rem]"
                  mascot={
                    isCorrectValue(question, selected) ? (
                      <div className="flex gap-2 text-5xl" aria-hidden="true">
                        {[0, 1, 2].map((i) => (
                          <span key={i} style={{ animation: `star-pop 0.5s ease-out ${i * 0.1}s backwards` }}>
                            ⭐
                          </span>
                        ))}
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src="/preschool/quiz/sad-face.jpeg"
                        alt=""
                        className="h-28 w-28 rounded-full object-cover shadow-lg"
                        style={{ animation: "sad-face-pop 0.5s ease-out" }}
                      />
                    )
                  }
                  message={
                    <p className="text-lg font-bold text-gray-700">
                      {isCorrectValue(question, selected) ? t("correct") : t("incorrect")}
                    </p>
                  }
                />
              )}
            </div>
          ) : (
          <div className="relative flex flex-col items-center gap-4 p-6 text-center">
            {passed && <CelebrationStars />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mascotForScore(correctCount)}
              alt=""
              className="h-24 w-24 rounded-full object-cover shadow-lg"
            />
            <p className="text-xl font-extrabold text-gray-800">{passed ? t("passedTitle") : t("failedTitle")}</p>
            <div className="flex gap-1 text-3xl" aria-hidden="true">
              {Array.from({ length: questions.length }, (_, i) => (
                <span key={i}>{i < correctCount ? "⭐" : "☆"}</span>
              ))}
            </div>
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
        </QuizCard>
      </div>
    </div>
  );
}
