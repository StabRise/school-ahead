"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type TransitionEvent } from "react";
import { useTranslations } from "next-intl";
import { useRewardMultiplicationGame } from "@school-ahead/api-client/browser/auth/auth";
import { Raccoon, EquippedAvatarLayers, useEquippedAvatarLayers, type RaccoonMood } from "@school-ahead/preschool-ui";
import { buildSession, CHOICE_COUNT, QUESTION_COUNT, type MultiplicationQuestion } from "./lib/multiplication-game";
import { useBackgroundMusic } from "./lib/use-background-music";
import { useDiamondMilestoneReward } from "./kit/use-diamond-milestone-reward";
import { playBuildSound, playCelebrationChime, playFallSound, playMissSound } from "./kit/sound-effects";
import { MusicToggleButton } from "./kit/music-toggle-button";
import { useMultiplicationGameStore } from "./stores/multiplication-game-store";

// Multiplication-table minigame — see docs/preschool/games/multiplication.md
// for the original design brief (that doc's Minecraft "Steve" theming was
// superseded per user feedback: the runner is the student's own equipped
// avatar, not a fixed character, running continuously along a full-width
// track like trains-game.tsx's train).
//
// Each round: the avatar auto-runs from the left edge toward a pit at
// PIT_START%. A correct hotbar answer builds the bridge immediately
// (whenever it arrives, even well before the avatar gets there) and locks
// in the round; once the avatar reaches the pit it either crosses the
// bridge and disappears off the right edge (bridge already built) or falls
// in and costs a heart (no correct answer yet, whether wrong guesses were
// made or none at all).
//
// Movement is driven by plain CSS *transitions* on `left`/`transform`
// (retargeted from React state), not @keyframes — a transition's
// `transitionend` only ever fires for the property that actually moved on
// its own element (unlike `animationend`, which also bubbles up from a
// child's unrelated finite CSS animation, e.g. RunnerAvatar's own
// happy/sad mood animation), so there's no risk of a nested animation
// prematurely ending a round. The "running" leg's very first frame is
// painted at 0% with no transition yet (key={runToken} forces a fresh
// mount each round), then one requestAnimationFrame later the target
// flips to PIT_START% — only *that* value change is transitioned, which is
// what actually makes the avatar visibly run instead of teleporting.

const LIVES = 3;
const MIN_SPEED = 0.5;
const MAX_SPEED = 3;
const RUN_DURATION_S = 6;
const CROSS_DURATION_S = 1.4;
const FALL_DURATION_S = 0.7; // Intentionally not speed-scaled — a short, fixed drama beat regardless of pace.
const WRONG_FLASH_MS = 400;

// Where the pit sits along the track, as a % of its width.
const PIT_START = 55;
const PIT_END = 68;

type Stage = "playing" | "gameOver" | "victory";
type Phase = "running" | "crossing" | "falling";
type SlotStatus = "default" | "correct" | "incorrect" | "dimmed";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true">
      <path
        d="M12 21s-7.3-4.7-9.8-9.1C.7 8.5 2.4 5.3 5.9 5.3c1.9 0 3.4 1 4.4 2.5 1-1.5 2.5-2.5 4.4-2.5 3.5 0 5.2 3.2 3.7 6.6C19.3 16.3 12 21 12 21z"
        fill={filled ? "#ef4444" : "none"}
        stroke={filled ? "#ef4444" : "#94a3b8"}
        strokeWidth="1.6"
      />
    </svg>
  );
}

// A fluffy speech-cloud holding the current question — see the design
// sketch: progress bar + hearts up top, the example inside a cloud below
// them, the runner track underneath, the hotbar at the bottom.
function QuestionCloud({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex items-center justify-center">
      <svg viewBox="0 0 200 110" className="h-24 w-52 drop-shadow sm:h-28 sm:w-60" aria-hidden="true">
        <path
          d="M50 82 Q18 82 18 56 Q18 34 40 31 Q43 14 63 14 Q79 14 85 27 Q99 16 115 25 Q133 18 144 34 Q167 34 169 56 Q171 80 145 82 Z"
          fill="white"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center px-8 text-center">{children}</div>
    </div>
  );
}

// The student's own equipped avatar (wardrobe outfit + all), same
// fallback-to-mascot pattern as preschool-ui/game-map.tsx's CompanionAvatar
// — an anonymous visitor (or a student who never picked an avatar) has no
// equipped layers, so the raccoon mascot runs instead.
function RunnerAvatar({ mood, className }: { mood: RaccoonMood; className: string }) {
  const layers = useEquippedAvatarLayers();
  if (layers.length > 0) {
    return (
      <span
        className={`flex items-center justify-center overflow-hidden rounded-full border-[3px] border-white bg-white/70 p-1 shadow-md ${className}`}
      >
        <EquippedAvatarLayers layers={layers} />
      </span>
    );
  }
  return <Raccoon mood={mood} className={className} />;
}

// Owns the "has the fresh DOM node painted at 0% yet" flag itself, reset
// for free by remounting (key={runToken} at the call site) rather than by
// an explicit setState-in-effect reset — see the file-level comment for why
// the first paint has to land before the transition can animate the move.
function AvatarRunner({
  phase,
  speed,
  mood,
  onTransitionEnd,
}: {
  phase: Phase;
  speed: number;
  mood: RaccoonMood;
  onTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => void;
}) {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setStarted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const left = phase === "running" ? (started ? `${PIT_START}%` : "0%") : phase === "crossing" ? "115%" : `${PIT_START}%`;
  const opacity = phase === "crossing" || phase === "falling" ? 0 : 1;
  const transform = phase === "falling" ? "translateX(-50%) translateY(60px) rotate(75deg)" : "translateX(-50%)";
  const transition =
    phase === "falling"
      ? `transform ${FALL_DURATION_S}s ease-in, opacity ${FALL_DURATION_S}s ease-in`
      : phase === "crossing"
        ? `left ${CROSS_DURATION_S / speed}s ease-in, opacity ${CROSS_DURATION_S / speed}s ease-in`
        : `left ${RUN_DURATION_S / speed}s linear`;
  const style: CSSProperties = { left, opacity, transform, transition };

  return (
    <div className="absolute bottom-6" style={style} onTransitionEnd={onTransitionEnd}>
      <RunnerAvatar mood={mood} className="h-12 w-12 sm:h-14 sm:w-14" />
    </div>
  );
}

// No numbered corner label — the choices are sorted ascending (see
// lib/multiplication-game.ts's generateChoices), so their left-to-right
// order is already the hint, and a shortcut digit would just be visual
// noise. Pressing 1-8 still selects by position (see the keydown handler
// below) as an unlabeled bonus, same as before.
function HotbarSlot({
  value,
  status,
  disabled,
  onClick,
}: {
  value: number;
  status: SlotStatus;
  disabled: boolean;
  onClick: () => void;
}) {
  const statusClass =
    status === "correct"
      ? "border-emerald-400 bg-emerald-100 ring-4 ring-emerald-300"
      : status === "incorrect"
        ? "border-red-400 bg-red-100 ring-4 ring-red-300"
        : status === "dimmed"
          ? "border-gray-300 bg-gray-100 opacity-50"
          : "border-gray-400 bg-gray-200 hover:bg-gray-300";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex aspect-square flex-col items-center justify-center rounded-md border-4 text-xl font-extrabold text-gray-800 shadow-inner transition sm:text-3xl ${statusClass}`}
    >
      {value}
    </button>
  );
}

function MultiplicationRun({ speed, onRetry }: { speed: number; onRetry: () => void }) {
  const t = useTranslations("MultiplicationGame");
  const [session] = useState(buildSession);
  const [index, setIndex] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [solvedCount, setSolvedCount] = useState(0);
  const [stage, setStage] = useState<Stage>("playing");
  const [phase, setPhase] = useState<Phase>("running");
  const [runToken, setRunToken] = useState(0);
  const [hasCorrectAnswer, setHasCorrectAnswer] = useState(false);
  const [wrongFlashIndex, setWrongFlashIndex] = useState<number | null>(null);
  const victoryBadgeRef = useRef<HTMLDivElement>(null);

  const rewardMultiplicationGame = useRewardMultiplicationGame();

  const question: MultiplicationQuestion | undefined = stage === "playing" ? session[index] : undefined;

  // Awards 1 Diamond for finishing all 20 questions with a heart left — an
  // anonymous visitor can still finish the run, they just don't earn
  // anything (see useDiamondMilestoneReward). Falling on the last life
  // never awards, even if most questions were solved correctly.
  useDiamondMilestoneReward({
    mode: "level",
    complete: stage === "victory",
    rewardMutation: rewardMultiplicationGame,
    originRef: victoryBadgeRef,
    onMilestone: playCelebrationChime,
  });

  const startNextRound = (nextIndex: number) => {
    if (nextIndex >= QUESTION_COUNT) {
      setStage("victory");
      return;
    }
    setIndex(nextIndex);
    setPhase("running");
    setHasCorrectAnswer(false);
    setWrongFlashIndex(null);
    setRunToken((token) => token + 1);
  };

  const handleAvatarTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (phase === "running" && event.propertyName === "left") {
      if (hasCorrectAnswer) {
        setPhase("crossing");
      } else {
        setPhase("falling");
        playFallSound();
      }
      return;
    }
    if (phase === "crossing" && event.propertyName === "left") {
      setSolvedCount((count) => count + 1);
      startNextRound(index + 1);
      return;
    }
    if (phase === "falling" && event.propertyName === "transform") {
      const remainingLives = Math.max(0, lives - 1);
      setLives(remainingLives);
      if (remainingLives <= 0) {
        setStage("gameOver");
      } else {
        startNextRound(index + 1);
      }
    }
  };

  const handleSelect = (choiceIndex: number) => {
    if (stage !== "playing" || phase !== "running" || hasCorrectAnswer || !question) return;
    if (choiceIndex === question.correctIndex) {
      setHasCorrectAnswer(true);
      playBuildSound();
    } else {
      setWrongFlashIndex(choiceIndex);
      playMissSound();
      setTimeout(() => setWrongFlashIndex((current) => (current === choiceIndex ? null : current)), WRONG_FLASH_MS);
    }
  };

  // Keys 1-8 mirror clicking the matching hotbar slot.
  useEffect(() => {
    if (stage !== "playing" || phase !== "running" || hasCorrectAnswer) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const slot = Number(event.key);
      if (Number.isInteger(slot) && slot >= 1 && slot <= CHOICE_COUNT) handleSelect(slot - 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, phase, hasCorrectAnswer, question]);

  const avatarMood: RaccoonMood = phase === "crossing" ? "happy" : phase === "falling" ? "sad" : "idle";

  return (
    <div className="relative flex w-full flex-1 flex-col items-center gap-3">
      {stage === "playing" && question && (
        <>
          <div className="flex w-full items-center justify-between gap-4 px-3 pt-14">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-bold text-gray-600 sm:text-sm">
                {t("progress", { current: index + 1, total: QUESTION_COUNT })}
              </p>
              <div className="h-2 w-32 overflow-hidden rounded-full bg-white/70 sm:w-44">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                  style={{ width: `${(index / QUESTION_COUNT) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: LIVES }, (_, i) => (
                <HeartIcon key={i} filled={i < lives} />
              ))}
            </div>
          </div>

          <QuestionCloud>
            <p className="text-2xl font-extrabold text-gray-800 sm:text-4xl">
              {question.a} × {question.b} = ?
            </p>
          </QuestionCloud>

          <div className="relative h-24 w-full overflow-hidden rounded-xl bg-gradient-to-b from-sky-100 to-transparent">
            <div className="absolute inset-x-0 bottom-0 h-6 bg-[#8a5a34]" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-6 h-1.5 bg-[#5b8c3a]" aria-hidden="true" />
            <div
              className="absolute bottom-0 h-10 bg-gradient-to-b from-[#241a10] to-[#0d0904]"
              style={{ left: `${PIT_START}%`, width: `${PIT_END - PIT_START}%` }}
              aria-hidden="true"
            />
            {hasCorrectAnswer && (
              <div
                className="absolute bottom-0 h-8 border-b-4 border-[#7a5230] bg-[#b98a5e]"
                style={{
                  left: `${PIT_START}%`,
                  width: `${PIT_END - PIT_START}%`,
                  transformOrigin: "left",
                  animation: "multiplication-bridge-build 0.4s ease-out forwards",
                }}
                aria-hidden="true"
              />
            )}
            <AvatarRunner key={runToken} phase={phase} speed={speed} mood={avatarMood} onTransitionEnd={handleAvatarTransitionEnd} />
          </div>

          <div className="mt-auto grid w-full grid-cols-4 gap-1.5 px-1.5 pb-2 sm:grid-cols-8 sm:gap-2 sm:px-2 sm:pb-3">
            {question.choices.map((choice, i) => {
              const roundOver = phase !== "running" || hasCorrectAnswer;
              const status: SlotStatus =
                roundOver && i === question.correctIndex
                  ? "correct"
                  : wrongFlashIndex === i
                    ? "incorrect"
                    : roundOver
                      ? "dimmed"
                      : "default";
              return (
                <HotbarSlot
                  key={`${choice}-${i}`}
                  value={choice}
                  status={status}
                  disabled={roundOver}
                  onClick={() => handleSelect(i)}
                />
              );
            })}
          </div>
        </>
      )}

      {stage === "gameOver" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="text-6xl" style={{ animation: "sad-face-pop 0.5s ease-out" }} aria-hidden="true">
            💥
          </div>
          <p className="text-2xl font-extrabold text-gray-800">{t("gameOverTitle")}</p>
          <p className="text-lg font-semibold text-gray-600">{t("solvedCount", { count: solvedCount, total: QUESTION_COUNT })}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-emerald-500 px-8 py-3 text-lg font-bold text-white shadow-lg transition-transform active:scale-95"
          >
            {t("retryButton")}
          </button>
        </div>
      )}

      {stage === "victory" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div ref={victoryBadgeRef} className="text-6xl" style={{ animation: "score-pop 0.4s ease-out" }} aria-hidden="true">
            🏆
          </div>
          <p className="text-2xl font-extrabold text-gray-800">{t("victoryTitle")}</p>
          <p className="text-lg font-semibold text-gray-600">{t("solvedCount", { count: solvedCount, total: QUESTION_COUNT })}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-emerald-500 px-8 py-3 text-lg font-bold text-white shadow-lg transition-transform active:scale-95"
          >
            {t("retryButton")}
          </button>
        </div>
      )}
    </div>
  );
}

export function MultiplicationGame() {
  useBackgroundMusic();
  const t = useTranslations("MultiplicationGame");
  const speed = useMultiplicationGameStore((s) => s.speed);
  const setSpeed = useMultiplicationGameStore((s) => s.setSpeed);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Remounting MultiplicationRun on retry (rather than resetting its state
  // in place) resets useDiamondMilestoneReward's once-per-mount dedupe too
  // — same "key={...}" trick as cards-game.tsx's CardsLevel, so a fresh
  // playthrough that reaches Victory again earns another Diamond.
  const [playToken, setPlayToken] = useState(0);

  return (
    <div className="relative flex flex-1 flex-col items-center">
      <button
        type="button"
        aria-label={t("settingsButton")}
        onClick={() => setSettingsOpen((current) => !current)}
        className="absolute left-20 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        ⚙️
      </button>
      <MusicToggleButton className="absolute left-32 top-4 z-10" />

      {settingsOpen && (
        <div className="absolute left-20 top-16 z-10 flex w-56 flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-lg ring-2 ring-gray-200">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("speedLabel")}</span>
            <input
              type="range"
              min={MIN_SPEED}
              max={MAX_SPEED}
              step={0.1}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      <MultiplicationRun key={playToken} speed={speed} onRetry={() => setPlayToken((token) => token + 1)} />
    </div>
  );
}
