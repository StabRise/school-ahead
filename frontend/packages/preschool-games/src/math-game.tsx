"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject, type TransitionEvent } from "react";
import { useTranslations } from "next-intl";
import { useRewardMultiplicationGame } from "@school-ahead/api-client/browser/auth/auth";
import { Raccoon, EquippedAvatarLayers, useEquippedAvatarLayers, type RaccoonMood } from "@school-ahead/preschool-ui";
import {
  generateQuestion,
  MAX_CHOICE_COUNT,
  MAX_LEVEL_BY_OPERATION,
  MIN_CHOICE_COUNT,
  MIN_LEVEL,
  OPERATIONS,
  QUESTION_COUNT,
  type GameQuestion,
  type Operation,
} from "./lib/math-game";
import { useBackgroundMusic } from "./lib/use-background-music";
import { useDiamondMilestoneReward } from "./kit/use-diamond-milestone-reward";
import { playBuildSound, playCelebrationChime, playFallSound, playMissSound } from "./kit/sound-effects";
import { MusicToggleButton } from "./kit/music-toggle-button";
import { useMathGameStore } from "./stores/math-game-store";

// Math-runner minigame (multiplication, division, addition, subtraction,
// and simple counting — see lib/math-game.ts's OPERATIONS) — see
// docs/preschool/games/multiplication.md for the original design brief
// (that doc's Minecraft "Steve" theming was superseded per user feedback:
// the runner is the student's own equipped avatar, not a fixed character,
// running continuously along a full-width track like trains-game.tsx's
// train; the operation/level system was added afterward, see lib/math-game.ts).
//
// Each round: the avatar auto-runs from the left edge toward a pit at
// PIT_START%. Only one hotbar answer is accepted per round, and answering
// either way — right or wrong — immediately cuts the ordinary run short: the
// avatar dashes the rest of the way to the pit at a fixed, quick pace (see
// the "rushing" phase) instead of plodding along at the normal speed for
// however much of the run was still left. A correct answer builds the
// bridge immediately (whenever it arrives, even well before the avatar gets
// there), so the dash ends in crossing the bridge and disappearing off the
// right edge; a wrong answer never builds one, so the dash ends in falling
// in and costing a heart. Reaching the pit with no answer given at all
// (timeout) falls in exactly the same way as a wrong answer, just via the
// ordinary "running" leg completing on its own instead of a "rushing" one.
//
// Movement is driven by plain CSS *transitions* on `left`/`transform`
// (retargeted from React state), not @keyframes — a transition's
// `transitionend` only ever fires for the property that actually moved on
// its own element (unlike `animationend`, which also bubbles up from a
// child's unrelated finite CSS animation, e.g. RunnerAvatar's own
// happy/sad mood animation), so there's no risk of a nested animation
// prematurely ending a round. Any leg that needs a fresh "cold start" (the
// very first "running" leg of a round, and the "rushing" leg cut in the
// instant an answer is picked) is rendered by a freshly-keyed AvatarRunner
// instance: its very first frame paints at the leg's starting position with
// no transition yet, then one requestAnimationFrame later the target flips
// to where that leg ends — only *that* value change is transitioned, which
// is what actually makes the avatar visibly move instead of teleporting.
// "crossing" and the natural (non-rushed) "falling" don't need a fresh key
// since they continue smoothly from exactly where the prior leg ended.

// Measures the vertical space actually left below wherever this element
// sits (accounting for the sticky site Header above it, which the global
// layout doesn't reserve a fixed height for) and reports it as a pixel
// height — set on the game's root element, with overflow-hidden, so the
// whole game always fits in one screen with no page-level vertical
// scrollbar instead of growing past the viewport on shorter screens.
// Re-measures on resize (rotating a tablet, browser chrome showing/hiding).
function useViewportFillHeight<T extends HTMLElement>(): [RefObject<T | null>, number | undefined] {
  const ref = useRef<T | null>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const top = el.getBoundingClientRect().top;
      setHeight(Math.max(320, window.innerHeight - top));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return [ref, height];
}

// Measures an element's own rendered width live (ResizeObserver, not just
// on mount) — used to size the hotbar's answer squares' font to however big
// those squares actually rendered (see HotbarSlot's fontSize prop), which
// changes with both the viewport and the current question's choiceCount.
function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (measured) setWidth(measured);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// The answer square's font should read as big as the square comfortably
// allows, but shrink for longer numbers (e.g. add/subtract level 5's up to
// 3-digit answers) so they still fit on one line — see HotbarSlot.
// Bounded to a sane [16px, 64px] range regardless of how big/small the
// measured square turns out to be.
function hotbarFontSizePx(slotWidthPx: number, maxDigits: number): number {
  const ratio = maxDigits <= 1 ? 0.5 : maxDigits === 2 ? 0.42 : maxDigits === 3 ? 0.34 : 0.28;
  return Math.min(64, Math.max(16, slotWidthPx * ratio));
}

const LIVES = 3;
const MIN_SPEED = 0.25;
const MAX_SPEED = 3;
const RUN_DURATION_S = 6;
const RUSH_DURATION_S = 0.5; // Fixed, not speed-scaled — a quick, decisive dash to the pit once any answer is locked in.
const CROSS_DURATION_S = 0.9; // Fixed, not speed-scaled — same "quick, decisive" beat as RUSH_DURATION_S.
const FALL_DURATION_S = 0.7; // Intentionally not speed-scaled — a short, fixed drama beat regardless of pace.

// Where the pit sits along the track, as a % of its width.
const PIT_START = 55;
const PIT_END = 68;

// Tailwind's grid-cols-N utilities are only picked up by its build-time
// class scanner when the literal class name appears somewhere in source —
// a template-interpolated `grid-cols-${n}` wouldn't be, hence this lookup
// spelling out every choiceCount the hotbar's settings slider allows
// (MIN_CHOICE_COUNT..MAX_CHOICE_COUNT).
// Low levels can shrink a question's actual choice count below the
// player-configured slider value (see lib/math-game.ts's buildChoiceSet
// doc comment) — down to 2 in the extreme (e.g. divide at
// level 1 only has two possible quotients) — hence entries all the way down
// from MAX_CHOICE_COUNT.
const HOTBAR_GRID_COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
  8: "grid-cols-8",
  9: "grid-cols-9",
  10: "grid-cols-10",
};

// Symbol shown between the two operands — "count" has no second operand and
// is rendered separately (an emoji cluster, not "a op b = ?"), see
// QuestionCloud usage below.
const OPERATOR_SYMBOL: Partial<Record<Operation, string>> = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
};

// Emoji for the settings panel's operation picker — purely decorative, the
// accessible label comes from next-intl (see the t(`operation.${op}`) calls
// below).
const OPERATION_EMOJI: Record<Operation, string> = {
  count: "🔢",
  add: "➕",
  subtract: "➖",
  multiply: "✖️",
  divide: "➗",
};

type Stage = "playing" | "gameOver" | "victory";
// "rushing" is the short, fixed-speed dash to the pit cut in when a wrong
// answer is picked before the avatar would otherwise have gotten there.
type Phase = "running" | "rushing" | "crossing" | "falling";
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
    <div className="relative flex shrink-0 items-center justify-center">
      <svg viewBox="0 0 200 110" className="h-24 w-48 drop-shadow sm:h-36 sm:w-72" aria-hidden="true">
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

// Owns the "has the fresh DOM node painted at its cold-start position yet"
// flag itself, reset for free by remounting (a fresh `key` at the call
// site) rather than by an explicit setState-in-effect reset — see the
// file-level comment for why the first paint has to land before the
// transition can animate the move. `coldStartLeft` is "0%" for a fresh
// round's "running" leg, or the interrupted position for a "rushing" leg
// cut in mid-run.
function AvatarRunner({
  phase,
  speed,
  mood,
  coldStartLeft,
  onTransitionEnd,
}: {
  phase: Phase;
  speed: number;
  mood: RaccoonMood;
  coldStartLeft: number;
  onTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => void;
}) {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setStarted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const left =
    phase === "running" || phase === "rushing"
      ? started
        ? `${PIT_START}%`
        : `${coldStartLeft}%`
      : phase === "crossing"
        ? "115%"
        : `${PIT_START}%`;
  const opacity = phase === "crossing" || phase === "falling" ? 0 : 1;
  const transform = phase === "falling" ? "translateX(-50%) translateY(60px) rotate(75deg)" : "translateX(-50%)";
  const transition =
    phase === "falling"
      ? `transform ${FALL_DURATION_S}s ease-in, opacity ${FALL_DURATION_S}s ease-in`
      : phase === "crossing"
        ? `left ${CROSS_DURATION_S}s ease-in, opacity ${CROSS_DURATION_S}s ease-in`
        : phase === "rushing"
          ? `left ${RUSH_DURATION_S}s ease-out`
          : `left ${RUN_DURATION_S / speed}s linear`;
  const style: CSSProperties = { left, opacity, transform, transition };

  return (
    <div className="absolute bottom-16" style={style} onTransitionEnd={onTransitionEnd}>
      <RunnerAvatar mood={mood} className="h-12 w-12 sm:h-14 sm:w-14" />
    </div>
  );
}

// No numbered corner label — the choices are sorted ascending (see
// lib/math-game.ts's buildChoiceSet), so their left-to-right
// order is already the hint, and a shortcut digit would just be visual
// noise. Pressing 1-8 still selects by position (see the keydown handler
// below) as an unlabeled bonus, same as before.
function HotbarSlot({
  value,
  status,
  disabled,
  fontSize,
  onClick,
}: {
  value: number;
  status: SlotStatus;
  disabled: boolean;
  // Measured from the square's own rendered width (see useElementWidth +
  // hotbarFontSizePx) — undefined only for the very first paint before that
  // measurement lands, when the text-xl/sm:text-3xl fallback classes apply.
  fontSize: number | undefined;
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
      style={fontSize ? { fontSize } : undefined}
      className={`flex aspect-square flex-col items-center justify-center rounded-md border-4 font-extrabold text-gray-800 shadow-inner transition ${fontSize ? "" : "text-xl sm:text-3xl"} ${statusClass}`}
    >
      {value}
    </button>
  );
}

function MathRun({
  speed,
  operation,
  level,
  choiceCount,
  onRetry,
}: {
  speed: number;
  operation: Operation;
  level: number;
  choiceCount: number;
  onRetry: () => void;
}) {
  const t = useTranslations("MathGame");
  // Each question is generated on demand (not a whole session pre-built
  // upfront) so a mid-game choiceCount/operation/level change (the settings
  // panel) takes effect starting with the very next question, instead of
  // only after a full retry — `startNextRound` below re-reads these props
  // fresh every time it generates one.
  const [question, setQuestion] = useState<GameQuestion>(() => generateQuestion(operation, level, choiceCount));
  const [index, setIndex] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [solvedCount, setSolvedCount] = useState(0);
  const [stage, setStage] = useState<Stage>("playing");
  const [phase, setPhase] = useState<Phase>("running");
  const [runToken, setRunToken] = useState(0);
  const [rushToken, setRushToken] = useState(0);
  const [rushFromPercent, setRushFromPercent] = useState(0);
  // Only one hotbar click is accepted per round — set the instant either a
  // right or wrong answer is picked, independent of `hasCorrectAnswer`
  // (which only tracks whether *that* click was the right one).
  const [locked, setLocked] = useState(false);
  const [hasCorrectAnswer, setHasCorrectAnswer] = useState(false);
  const victoryBadgeRef = useRef<HTMLDivElement>(null);
  // Wall-clock time the current round's "running" leg started — lets a
  // wrong click compute how far along the (linear) 0%-to-PIT_START% run the
  // avatar actually is, so the "rushing" leg can pick up from exactly
  // there instead of snapping back to the start or jumping ahead.
  const runStartRef = useRef(0);

  const rewardMultiplicationGame = useRewardMultiplicationGame();

  // Awards 1 Diamond for finishing every question with a heart left — an
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

  useEffect(() => {
    runStartRef.current = performance.now();
  }, [runToken]);

  const startNextRound = (nextIndex: number) => {
    if (nextIndex >= QUESTION_COUNT) {
      setStage("victory");
      return;
    }
    setIndex(nextIndex);
    setQuestion(generateQuestion(operation, level, choiceCount));
    setPhase("running");
    setLocked(false);
    setHasCorrectAnswer(false);
    setRushToken(0);
    setRunToken((token) => token + 1);
  };

  const handleAvatarTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if ((phase === "running" || phase === "rushing") && event.propertyName === "left") {
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
    if (stage !== "playing" || phase !== "running" || locked || !question) return;
    setLocked(true);
    const correct = choiceIndex === question.correctIndex;
    if (correct) {
      setHasCorrectAnswer(true);
      playBuildSound();
    } else {
      playMissSound();
    }
    // Either way, the round is decided — no reason to keep plodding along
    // at the ordinary pace for however much of the run is left. Cut
    // straight to a quick dash from wherever the avatar actually is right
    // now to the pit: crossing the just-built bridge if correct, or
    // tumbling in if not (see handleAvatarTransitionEnd).
    const elapsedMs = performance.now() - runStartRef.current;
    const fraction = Math.min(1, Math.max(0, elapsedMs / ((RUN_DURATION_S / speed) * 1000)));
    setRushFromPercent(fraction * PIT_START);
    setRushToken((token) => token + 1);
    setPhase("rushing");
  };

  // Keys 1-N (N = the current question's choice count) mirror clicking the
  // matching hotbar slot.
  useEffect(() => {
    if (stage !== "playing" || phase !== "running" || locked || !question) return;
    const slotCount = question.choices.length;
    const handleKeyDown = (event: KeyboardEvent) => {
      const slot = Number(event.key);
      if (Number.isInteger(slot) && slot >= 1 && slot <= slotCount) handleSelect(slot - 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, phase, locked, question]);

  const avatarMood: RaccoonMood = phase === "crossing" ? "happy" : phase === "falling" ? "sad" : "idle";

  const columns = question.choices.length;
  const [hotbarRef, hotbarWidth] = useElementWidth<HTMLDivElement>();
  const maxDigits = Math.max(1, ...question.choices.map((choice) => String(choice).length));
  const HOTBAR_GAP_PX = 8; // gap-2
  const slotWidth = hotbarWidth > 0 ? (hotbarWidth - HOTBAR_GAP_PX * (columns - 1)) / columns : 0;
  const hotbarFontSize = slotWidth > 0 ? hotbarFontSizePx(slotWidth, maxDigits) : undefined;

  return (
    <div className="relative flex h-full w-full flex-1 flex-col items-center gap-2 overflow-hidden">
      {stage === "playing" && question && (
        <>
          <div className="grid w-full shrink-0 grid-cols-3 items-center gap-4 px-3 pt-14">
            <div aria-hidden="true" />
            <div className="flex flex-col items-center gap-1">
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
            <div className="flex justify-end gap-1">
              {Array.from({ length: LIVES }, (_, i) => (
                <HeartIcon key={i} filled={i < lives} />
              ))}
            </div>
          </div>

          <QuestionCloud>
            {question.operation === "count" ? (
              <div className="flex flex-col items-center gap-1">
                <p className="text-xs font-bold text-gray-500 sm:text-sm">{t("countPrompt")}</p>
                {question.a > 0 && (
                  <div className="flex max-w-[220px] flex-wrap items-center justify-center gap-1 sm:max-w-[280px]">
                    {Array.from({ length: question.a }, (_, i) => (
                      <span key={i} className="text-5xl sm:text-6xl" aria-hidden="true">
                        {question.emoji}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-3xl font-extrabold text-gray-800 sm:text-5xl">
                {question.a} {OPERATOR_SYMBOL[question.operation]} {question.b} = ?
              </p>
            )}
          </QuestionCloud>

          <div className="relative min-h-[6rem] w-full flex-1 overflow-hidden bg-gradient-to-b from-sky-100 to-transparent">
            <div className="absolute inset-x-0 bottom-0 h-16 bg-[#8a5a34]" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-16 h-2 bg-[#5b8c3a]" aria-hidden="true" />
            <div
              className="absolute bottom-0 h-18 bg-gradient-to-b from-[#241a10] to-[#0d0904]"
              style={{ left: `${PIT_START}%`, width: `${PIT_END - PIT_START}%` }}
              aria-hidden="true"
            />
            {hasCorrectAnswer && (
              <div
                className="absolute bottom-16 h-2 border-b-4 border-[#7a5230] bg-[#b98a5e]"
                style={{
                  left: `${PIT_START}%`,
                  width: `${PIT_END - PIT_START}%`,
                  transformOrigin: "left",
                  animation: "math-bridge-build 0.4s ease-out forwards",
                }}
                aria-hidden="true"
              />
            )}
            <AvatarRunner
              key={`${runToken}-${rushToken}`}
              phase={phase}
              speed={speed}
              mood={avatarMood}
              coldStartLeft={phase === "rushing" ? rushFromPercent : 0}
              onTransitionEnd={handleAvatarTransitionEnd}
            />
          </div>

          <div
            ref={hotbarRef}
            // Capped per-column width (not just w-full) so a low
            // choiceCount (see lib/math-game.ts's buildChoiceSet) doesn't
            // stretch each square into an oversized tile that could push
            // the page taller than the viewport — mx-auto centers the
            // capped row instead of hugging the left edge.
            style={{ maxWidth: `${columns * 7}rem` }}
            className={`mx-auto grid w-full shrink-0 gap-2 px-4 pb-4 ${HOTBAR_GRID_COLS[columns] ?? "grid-cols-8"}`}
          >
            {question.choices.map((choice, i) => {
              const status: SlotStatus = locked && i === question.correctIndex ? "correct" : locked ? "dimmed" : "default";
              return (
                <HotbarSlot
                  key={`${choice}-${i}`}
                  value={choice}
                  status={status}
                  disabled={locked}
                  fontSize={hotbarFontSize}
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

export function MathGame() {
  useBackgroundMusic();
  const t = useTranslations("MathGame");
  const speed = useMathGameStore((s) => s.speed);
  const setSpeed = useMathGameStore((s) => s.setSpeed);
  const choiceCount = useMathGameStore((s) => s.choiceCount);
  const setChoiceCount = useMathGameStore((s) => s.setChoiceCount);
  const operation = useMathGameStore((s) => s.operation);
  const setOperation = useMathGameStore((s) => s.setOperation);
  const level = useMathGameStore((s) => s.level);
  const setLevel = useMathGameStore((s) => s.setLevel);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const maxLevel = MAX_LEVEL_BY_OPERATION[operation];
  // Remounting MathRun on retry (rather than resetting its state
  // in place) resets useDiamondMilestoneReward's once-per-mount dedupe too
  // — same "key={...}" trick as cards-game.tsx's CardsLevel, so a fresh
  // playthrough that reaches Victory again earns another Diamond.
  const [playToken, setPlayToken] = useState(0);
  const [rootRef, fillHeight] = useViewportFillHeight<HTMLDivElement>();

  return (
    <div
      ref={rootRef}
      style={{ height: fillHeight }}
      className="relative flex flex-1 flex-col items-center overflow-hidden"
    >
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
        <div className="absolute left-20 top-16 z-10 flex w-64 flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-lg ring-2 ring-gray-200">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("operationLabel")}</span>
            <div className="flex justify-between gap-1">
              {OPERATIONS.map((op) => (
                <button
                  key={op}
                  type="button"
                  aria-label={t(`operation.${op}`)}
                  aria-pressed={operation === op}
                  onClick={() => setOperation(op)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition ${
                    operation === op ? "bg-emerald-400 ring-2 ring-emerald-500" : "bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  {OPERATION_EMOJI[op]}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("levelLabel", { level, max: maxLevel })}</span>
            <input
              type="range"
              min={MIN_LEVEL}
              max={maxLevel}
              step={1}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
            />
          </label>
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
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("choiceCountLabel")}</span>
            <input
              type="range"
              min={MIN_CHOICE_COUNT}
              max={MAX_CHOICE_COUNT}
              step={1}
              value={choiceCount}
              onChange={(e) => setChoiceCount(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      <MathRun
        key={playToken}
        speed={speed}
        operation={operation}
        level={level}
        choiceCount={choiceCount}
        onRetry={() => setPlayToken((token) => token + 1)}
      />
    </div>
  );
}
