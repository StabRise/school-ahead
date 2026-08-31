"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { speak, type SpeechLanguage as GameLanguage } from "@/lib/piper-tts";
import { QuizAnswerButton, QuizBanner, QuizCard, QuizFeedbackOverlay, QuizReadAloudButton } from "@/components/quiz-ui";

// Bonus quiz opened by popping the heart-shaped "?" balloon in
// balloon-pop-game.tsx. Purely client-side and ephemeral (no backend lesson
// record), built from scratch rather than reusing components/preschool/
// quiz-game.tsx, which is tightly coupled to a real StudentLesson's
// QuizQuestion data. Visual language borrows from that component and
// theory-check.tsx (gradient banner, rounded-[2rem] white card, bold
// border-4 answer buttons).
//
// Every mode gets the same "where is X?" question: pick the matching card
// out of a few, shown as an image if it has one, or as big text otherwise
// (same duality as BalloonLearningCards) — no per-mode question kind
// anymore. The question phrasing itself ("Where is {card}?" by default) is
// resolved per mode/language by the caller (see quizFormat in
// balloon-pop-game.tsx) from that mode's title.json, not hardcoded here.

export interface QuizCard {
  // Canonical name, matching PreschoolCard.key in lib/preschool-sounds.ts —
  // used to dedupe/compare cards; `name` (the possibly-translated display
  // text) is what's shown/spoken.
  key: string;
  name: string;
  image?: string;
}

export interface BalloonQuizQuestion {
  target: QuizCard;
  choices: QuizCard[];
  correctIndex: number;
}

const QUESTION_COUNT = 6;
// Strictly greater than 60% — 4/6 (~66.7%) passes, 3/6 (50%) doesn't.
const PASS_RATIO = 0.6;
const MAX_CHOICES = 4;
const FEEDBACK_DELAY_MS = 1500;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Case-insensitive dedupe by key, keeping the first occurrence — a folder
// can end up with casing duplicates (e.g. "Panda.jpeg"/"panda.jpeg") that
// would otherwise show up as two indistinguishable choices in the same
// question.
function uniqueByKey(cards: QuizCard[]): QuizCard[] {
  const seen = new Set<string>();
  const result: QuizCard[] = [];
  for (const card of cards) {
    const key = card.key.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(card);
  }
  return result;
}

// `target` is passed in (rather than picked here) so buildBalloonQuizQuestions
// can hand out a distinct target per question — see pickUniqueTargets.
function buildQuestion(pool: QuizCard[], target: QuizCard): BalloonQuizQuestion {
  const distractorPool = pool.filter((c) => c.key.toLowerCase() !== target.key.toLowerCase());
  const distractors = shuffle(distractorPool).slice(0, Math.min(MAX_CHOICES - 1, distractorPool.length));
  const choices = shuffle([target, ...distractors]);
  return { target, choices, correctIndex: choices.findIndex((c) => c === target) };
}

// One target per question, none repeated — as long as `pool` has at least
// `count` items (guaranteed by MIN_CARD_COUNT in balloon-pop-game.tsx).
// Only wraps around (repeating a target) if the pool is smaller than
// `count`, which shouldn't happen given that guarantee.
function pickUniqueTargets(pool: QuizCard[], count: number): QuizCard[] {
  if (pool.length === 0) return [];
  const shuffled = shuffle(pool);
  return Array.from({ length: count }, (_, i) => shuffled[i % shuffled.length]);
}

export function buildBalloonQuizQuestions(cards: QuizCard[]): BalloonQuizQuestion[] {
  const pool = uniqueByKey(cards);
  const targets = pickUniqueTargets(pool, QUESTION_COUNT);
  return targets.map((target) => buildQuestion(pool, target));
}

// Fills `questionFormat`'s "{card}" placeholder with the target's display
// name — e.g. "Where is number {card}?" + "5" -> "Where is number 5?".
function questionText(question: BalloonQuizQuestion, questionFormat: string): string {
  return questionFormat.replace("{card}", question.target.name);
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
  questionFormat,
  muted,
  onFinish,
}: {
  questions: BalloonQuizQuestion[];
  language: GameLanguage;
  // "Where is {card}?" by default, or a mode's own title.json override —
  // see quizFormat in balloon-pop-game.tsx.
  questionFormat: string;
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
    speak(questionText(question, questionFormat), language, "sentence");
    // `question` is derived from `questions`/`currentIndex` every render, so
    // depending on it directly would refire this on every render — depend on
    // its actual identity-changing inputs instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, questions, language, questionFormat, muted]);

  // Fires once, the instant the finish screen appears with a passing score
  // — `finished`/`passed` are derived from currentIndex/correctCount and
  // never flip back once true, so this can't re-trigger on later re-renders.
  useEffect(() => {
    if (finished && passed && !muted) playPassSound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, passed]);

  const handleSelect = (value: number) => {
    if (selected !== null || !question) return;
    setSelected(value);
    const correct = value === question.correctIndex;
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
          {question ? (
            <>
              <QuizBanner>
                <p className="text-center text-sm font-bold text-gray-900/70 sm:text-base">
                  {t("progress", { current: currentIndex + 1, total: questions.length })}
                </p>
              </QuizBanner>

              <div className="flex mt-4 items-center justify-center gap-2">
                <p className="text-center text-xl font-extrabold uppercase text-gray-900 sm:text-2xl">
                  {questionText(question, questionFormat)}
                </p>
                <QuizReadAloudButton
                  label={t("readAloudButton")}
                  onClick={() => speak(questionText(question, questionFormat), language, "sentence")}
                />
              </div>

              <div className="relative flex flex-col gap-5 p-6">
                <div className="grid grid-cols-2 gap-3">
                  {question.choices.map((choice, i) => {
                    const isPicked = selected === i;
                    const isCorrectChoice = i === question.correctIndex;
                    const revealed = selected !== null && (isPicked || isCorrectChoice);
                    const isDimmed = selected !== null && !revealed;
                    const status = revealed ? (isCorrectChoice ? "correct" : "incorrect") : isDimmed ? "dimmed" : "default";
                    return (
                      <QuizAnswerButton
                        key={`${choice.key}-${i}`}
                        index={i}
                        status={status}
                        disabled={selected !== null}
                        onClick={() => handleSelect(i)}
                        className={choice.image ? "overflow-hidden p-1" : "py-6 text-3xl font-extrabold text-gray-900"}
                      >
                        {choice.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={choice.image} alt="" className="aspect-square w-full rounded-xl object-cover" />
                        ) : (
                          choice.name
                        )}
                      </QuizAnswerButton>
                    );
                  })}
                </div>

                {selected !== null && (
                  <QuizFeedbackOverlay
                    roundedClassName="rounded-[2rem]"
                    mascot={
                      selected === question.correctIndex ? (
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
                        {selected === question.correctIndex ? t("correct") : t("incorrect")}
                      </p>
                    }
                  />
                )}
              </div>
            </>
          ) : (
            <div className="relative flex flex-col items-center gap-4 p-6 text-center">
              {passed && <CelebrationStars />}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mascotForScore(correctCount)} alt="" className="h-24 w-24 rounded-full object-cover shadow-lg" />
              <p className="text-xl font-extrabold text-gray-800">{passed ? t("passedTitle") : t("failedTitle")}</p>
              <div className="flex gap-1 text-3xl" aria-hidden="true">
                {Array.from({ length: questions.length }, (_, i) => (
                  <span key={i}>{i < correctCount ? "⭐" : "☆"}</span>
                ))}
              </div>
              <p className="text-base font-semibold text-gray-700">{passed ? t("passedMessage") : t("failedMessage")}</p>
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
