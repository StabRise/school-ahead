"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject, type TransitionEvent } from "react";
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
import { playBuildSound, playCelebrationChime, playFallSound, playMissSound, playVictoryFanfare } from "./kit/sound-effects";
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

// A "game clock" that stops advancing while `paused` is true — every
// elapsed-time computation below (how far into its leg the avatar's CSS
// transition currently is) reads this instead of performance.now()
// directly, so pausing mid-run and resuming later doesn't silently eat a
// chunk of the run's timing. While paused, totalPausedMs grows at exactly
// the same rate real time does, which is what holds the returned value
// constant for the whole pause (see the arithmetic below).
function usePausableClock(paused: boolean): () => number {
  const pausedAtRef = useRef<number | null>(null);
  const totalPausedMsRef = useRef(0);
  useEffect(() => {
    if (paused) {
      pausedAtRef.current = performance.now();
    } else if (pausedAtRef.current !== null) {
      totalPausedMsRef.current += performance.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
  }, [paused]);
  return useCallback(() => {
    const pausedSoFar = totalPausedMsRef.current + (pausedAtRef.current !== null ? performance.now() - pausedAtRef.current : 0);
    return performance.now() - pausedSoFar;
  }, []);
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

// One animal's base size (rem) in a count-mode cluster — shrinks as the
// count grows (up to 10 from level 8, see COUNT_LEVELS in lib/math-game.ts)
// so a big cluster still wraps into a reasonable number of rows instead of
// forcing QuestionCloud ever wider/taller than the screen comfortably
// allows. A varied-size level (see emojiSizes on GameQuestion) multiplies
// this per-animal, same interpolation shape as hotbarFontSizePx/
// bigCardSizeRem elsewhere in this codebase.
const COUNT_EMOJI_MAX_REM = 4.5;
const COUNT_EMOJI_MIN_REM = 2;
const MAX_COUNT_FOR_MAX_SIZE = 3;
const MIN_COUNT_FOR_MIN_SIZE = 10;

function countEmojiSizeRem(count: number): number {
  const clamped = Math.min(MIN_COUNT_FOR_MIN_SIZE, Math.max(MAX_COUNT_FOR_MAX_SIZE, count));
  const t = (clamped - MAX_COUNT_FOR_MAX_SIZE) / (MIN_COUNT_FOR_MIN_SIZE - MAX_COUNT_FOR_MAX_SIZE);
  return COUNT_EMOJI_MAX_REM - t * (COUNT_EMOJI_MAX_REM - COUNT_EMOJI_MIN_REM);
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

// A full ×1..×10 times-table is a standard teaching aid regardless of which
// factor range the current level actually quizzes on (see
// MULTIPLY_MAX_FACTOR_BY_LEVEL in lib/math-game.ts) — shown on pause when
// the "showHint" setting is on (see PauseOverlay in MathRun).
const TIMES_TABLE_MAX = 10;

// The one number a multiply/divide question's times-table hint is built
// from — the first factor for multiply (e.g. "5 × 6 = ?" hints ×5's whole
// table), the divisor for divide (e.g. "30 ÷ 5 = ?" also hints ×5's table,
// since that's the table a child scans to find which line lands on 30).
// null for count/add/subtract, which have no such table to show.
function timesTableKeyNumber(question: GameQuestion): number | null {
  if (question.operation === "multiply") return question.a;
  if (question.operation === "divide") return question.b;
  return null;
}

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
// No "correct" status — a right answer isn't highlighted at all, only a
// wrong pick is (see HotbarSlot below); the avatar building/crossing the
// bridge is feedback enough for a correct one.
type SlotStatus = "default" | "incorrect" | "dimmed";

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
// The cloud grows to fit whatever's inside it instead of clipping at a
// fixed size — count mode can show anywhere from 0 to 10 animals (see
// COUNT_LEVELS in lib/math-game.ts), far more than the old fixed-size
// cloud could ever hold, so a big cluster used to spill out past its edges
// (some animals rendering outside the cloud shape entirely). The SVG's
// `preserveAspectRatio="none"` lets it stretch non-uniformly to exactly
// match the content div's box (an ordinary in-flow child, sized by its own
// content/padding) — a plain `absolute inset-0 h-full w-full` on the SVG
// wouldn't otherwise track a *changing* content size the way a fixed-size
// sibling would. `min-h-*`/`min-w-*` keep the old fixed size as a floor for
// small content (e.g. a single-digit arithmetic question).
function QuestionCloud({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex shrink-0 items-center justify-center">
      <svg
        viewBox="0 0 200 110"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full drop-shadow"
        aria-hidden="true"
      >
        <path
          d="M50 82 Q18 82 18 56 Q18 34 40 31 Q43 14 63 14 Q79 14 85 27 Q99 16 115 25 Q133 18 144 34 Q167 34 169 56 Q171 80 145 82 Z"
          fill="white"
        />
      </svg>
      <div className="relative flex min-h-32 min-w-64 items-center justify-center px-10 py-6 text-center sm:min-h-48 sm:min-w-96">
        {children}
      </div>
    </div>
  );
}

const VICTORY_CONFETTI_EMOJI = ["🎉", "✨", "🌟", "🎊"];
const VICTORY_CONFETTI_COUNT = 24;

// Falling confetti for the victory screen — reuses the same confetti-fall
// keyframe as CelebrationScene/Jumping Frogs's overlay (see globals.css).
// A lazy useState initializer, not a plain constant, so the random layout
// is rolled once per mount rather than re-rolling (and visibly jittering)
// on every render.
function VictoryConfetti() {
  const [pieces] = useState(() =>
    Array.from({ length: VICTORY_CONFETTI_COUNT }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 1.6 + Math.random() * 1.2,
      emoji: VICTORY_CONFETTI_EMOJI[i % VICTORY_CONFETTI_EMOJI.length],
    })),
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="absolute top-0 text-2xl"
          style={{ left: `${piece.left}%`, animation: `confetti-fall ${piece.duration}s ease-in ${piece.delay}s forwards` }}
        >
          {piece.emoji}
        </span>
      ))}
    </div>
  );
}

// The student's own equipped avatar (wardrobe outfit + all), same
// fallback-to-mascot pattern as preschool-ui/game-map.tsx's CompanionAvatar
// — an anonymous visitor (or a student who never picked an avatar) has no
// equipped layers, so the raccoon mascot runs instead. Deliberately not
// cropped into a circular badge (unlike game-map.tsx's CompanionAvatar) —
// a round frame clipped tall headwear/accessories no matter how it was
// sized, so this just shows the full costume plainly, uncropped, both
// while running and on the victory screen.
function RunnerAvatar({ mood, className }: { mood: RaccoonMood; className: string }) {
  const layers = useEquippedAvatarLayers();
  if (layers.length > 0) {
    return (
      <span className={`flex items-center justify-center ${className}`}>
        <EquippedAvatarLayers layers={layers} crop={false} />
      </span>
    );
  }
  return <Raccoon mood={mood} className={className} />;
}

function lerp(from: number, to: number, fraction: number): number {
  return from + (to - from) * fraction;
}

// One easing keyword per phase — reused both for the live CSS transition
// and (approximately — see the freeze/resume comment below) for
// reconstructing where along the leg the avatar visually is when pausing
// mid-leg.
const PHASE_EASING: Record<Phase, string> = {
  running: "linear",
  rushing: "ease-out",
  crossing: "ease-in",
  falling: "ease-in",
};

// The avatar's left/opacity/transform at an arbitrary point (0-1) along the
// current phase's leg — normally the browser interpolates this for us via
// the CSS transition, but pausing needs to freeze at a specific
// in-between point, which means computing that point ourselves. `fraction`
// is linear-time-based even for eased phases (rushing/crossing/falling),
// so a freeze mid-leg is a close approximation of the true eased position
// rather than pixel-exact — imperceptible given those legs are short and
// the pause screen covers the avatar anyway.
function avatarVisualAt(
  phase: Phase,
  fraction: number,
  fromPercent: number,
): { left: string; opacity: number; transform: string } {
  if (phase === "falling") {
    // Drifts from the pit's left edge to its center as a % of track width
    // (not a fixed px offset, which used to land the avatar well past the
    // pit's right edge — visibly "falling" past it — on any track narrower
    // than the offset was tuned for).
    const pitCenter = PIT_START + (PIT_END - PIT_START) / 2;
    return {
      left: `${lerp(PIT_START, pitCenter, fraction)}%`,
      opacity: lerp(1, 0, fraction),
      transform: `translateX(-50%) translateY(${lerp(0, 60, fraction)}px) rotate(${lerp(0, 75, fraction)}deg)`,
    };
  }
  if (phase === "crossing") {
    return { left: `${lerp(PIT_START, 115, fraction)}%`, opacity: lerp(1, 0, fraction), transform: "translateX(-50%)" };
  }
  // running or rushing — both just move left towards the pit.
  return { left: `${lerp(fromPercent, PIT_START, fraction)}%`, opacity: 1, transform: "translateX(-50%)" };
}

// Owns the "has the fresh DOM node painted at its start position yet" flag
// itself, reset for free by remounting (a fresh `key` at the call site)
// rather than by an explicit setState-in-effect reset — see the file-level
// comment for why the first paint has to land before the transition can
// animate the move. Every leg (a fresh round's "running", the "rushing"
// dash cut in on an answer, "crossing"/"falling", and a leg resumed after a
// pause) is one of these mounts: `initialFraction`/`durationMs` are 0/full
// for a fresh leg, or the frozen fraction/remaining time for a resumed one
// — see MathRun's beginPhase/resumeGame. `frozenFraction`, unlike the
// others, is a normal reactive prop (not baked in at mount): it's set the
// instant the game is paused and overrides the rendered position to that
// exact frozen point with no transition, without needing to remount.
function AvatarRunner({
  phase,
  fromPercent,
  initialFraction,
  durationMs,
  frozenFraction,
  mood,
  onTransitionEnd,
}: {
  phase: Phase;
  fromPercent: number;
  initialFraction: number;
  durationMs: number;
  frozenFraction: number | null;
  mood: RaccoonMood;
  onTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => void;
}) {
  const [progressed, setProgressed] = useState(false);
  useEffect(() => {
    if (frozenFraction !== null) return;
    const raf = requestAnimationFrame(() => setProgressed(true));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fraction = frozenFraction ?? (progressed ? 1 : initialFraction);
  const { left, opacity, transform } = avatarVisualAt(phase, fraction, fromPercent);
  const transition =
    frozenFraction !== null || !progressed
      ? "none"
      : `left ${durationMs}ms ${PHASE_EASING[phase]}, opacity ${durationMs}ms ${PHASE_EASING[phase]}, transform ${durationMs}ms ${PHASE_EASING[phase]}`;

  return (
    <div className="absolute bottom-16" style={{ left, opacity, transform, transition }} onTransitionEnd={onTransitionEnd}>
      <RunnerAvatar mood={mood} className="h-20 w-20 sm:h-24 sm:w-24" />
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
    status === "incorrect"
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
  showHint,
  onRetry,
  onPauseChange,
}: {
  speed: number;
  operation: Operation;
  level: number;
  choiceCount: number;
  // Multiply/divide only — see PauseOverlay's times-table hint below.
  showHint: boolean;
  onRetry: () => void;
  onPauseChange: (paused: boolean) => void;
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
  // Bumped on every fresh leg (a round's "running" start, the "rushing"
  // dash cut in on an answer, "crossing"/"falling", and a leg resumed after
  // a pause) — the AvatarRunner `key` below, forcing a fresh cold-start
  // mount each time (see AvatarRunner's doc comment).
  const [legToken, setLegToken] = useState(0);
  const [paused, setPaused] = useState(false);
  // Only one hotbar click is accepted per round — set the instant either a
  // right or wrong answer is picked, independent of `hasCorrectAnswer`
  // (which only tracks whether *that* click was the right one).
  const [locked, setLocked] = useState(false);
  const [hasCorrectAnswer, setHasCorrectAnswer] = useState(false);
  // Which hotbar slot was actually clicked — so a wrong pick can be
  // highlighted red without also revealing the correct one in green (see
  // the choices.map status computation below).
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // Diamond-flight origin for the reward below — mounted in the same
  // render that flips stage to "victory", so it's already on screen by the
  // time useDiamondMilestoneReward's effect reads its rect.
  const victoryBadgeRef = useRef<HTMLDivElement>(null);

  // The current leg's bookkeeping — a "leg" is one AvatarRunner mount's
  // worth of motion (see AvatarRunner's doc comment). `fromPercent` is the
  // leg's fixed start-left% for "running"/"rushing" (irrelevant, but
  // harmless, for "crossing"/"falling" — see avatarVisualAt); `durationMs`
  // is the current *segment*'s own duration (the leg's full duration for a
  // fresh one, the remaining time for a resumed one); `consumedFraction` is
  // how much of the leg's overall 0-1 progress was already done before this
  // segment began (0 for a fresh leg). State, not refs, since it's read
  // directly in the AvatarRunner render below — reading a ref during render
  // isn't safe. Read together with `phaseProgress()`. The lazy initial
  // value matches the very first round's "running" leg (0% -> PIT_START%
  // over the initial speed's run duration) — the same values beginPhase
  // would set, since that first leg starts before any beginPhase call: a
  // 0 durationMs here would give the CSS transition a 0ms duration, and a
  // zero-duration transition never fires transitionend, so the game would
  // never advance past round 1 at all.
  const [legInfo, setLegInfo] = useState(() => ({ fromPercent: 0, durationMs: (RUN_DURATION_S / speed) * 1000, consumedFraction: 0 }));
  // Rendered directly as AvatarRunner's frozenFraction prop — non-null iff
  // paused, set once by pauseGame and cleared by resumeGame.
  const [frozenFraction, setFrozenFraction] = useState<number | null>(null);
  // Game-clock time the current segment started — only read/written from
  // event-handler code (phaseProgress, beginPhase, resumeGame), never
  // during render, so a plain ref (not state) is fine here. Set for real by
  // the mount effect just below — 0 until then is harmless since nothing
  // reads it before that effect runs (it fires before any user input can).
  const phaseStartRef = useRef(0);
  // How much of the segment interrupted by pauseGame was left — stashed
  // here (rather than computed fresh in resumeGame) so both read the exact
  // same snapshot; also event-handler-only, never rendered.
  const remainingMsRef = useRef(0);

  const gameNow = usePausableClock(paused);

  // Round 1's "running" leg starts before any beginPhase call (legInfo's
  // lazy initial value above covers its duration/from/consumed), so this
  // sets the one remaining piece — its segment start time — the same way
  // beginPhase would, without calling an impure function during render.
  useEffect(() => {
    phaseStartRef.current = gameNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rewardMultiplicationGame = useRewardMultiplicationGame();

  // Awards 1 Diamond once the whole run is cleared (all QUESTION_COUNT
  // questions solved — reaching "victory") — not per correct answer along
  // the way, so a run doesn't pay out until it's actually finished. An
  // anonymous visitor still sees the run play out, they just don't earn
  // anything (see useDiamondMilestoneReward).
  useDiamondMilestoneReward({
    mode: "level",
    complete: stage === "victory",
    rewardMutation: rewardMultiplicationGame,
    originRef: victoryBadgeRef,
    onMilestone: playCelebrationChime,
  });

  useEffect(() => {
    if (stage === "victory") playVictoryFanfare();
  }, [stage]);

  // Lets MathGame duck the background music while paused (see its
  // useBackgroundMusic call) without this component needing to know
  // anything about audio itself.
  useEffect(() => {
    onPauseChange(paused);
  }, [paused, onPauseChange]);

  // Starts a fresh leg: resets this leg's bookkeeping to segment 0 (no
  // progress consumed yet) and bumps legToken to remount AvatarRunner cold
  // — see its doc comment.
  const beginPhase = (newPhase: Phase, fromPercent: number, durationMs: number) => {
    phaseStartRef.current = gameNow();
    setLegInfo({ fromPercent, durationMs, consumedFraction: 0 });
    setPhase(newPhase);
    setLegToken((token) => token + 1);
  };

  // Where the current leg's progress actually is right now (0-1, absolute
  // — not just this segment's), and how much of this segment's own
  // duration is left. Used both to cut a leg short on an answer (handleSelect)
  // and to freeze it on pause (pauseGame). Reads `legInfo` from this
  // render's closure, which is fine — both call sites below run inside
  // event handlers that only ever read it *before* the same handler goes on
  // to change it (never after), so there's no staleness to worry about.
  const phaseProgress = (): { fraction: number; remainingMs: number } => {
    const elapsed = Math.max(0, gameNow() - phaseStartRef.current);
    const segmentFraction = legInfo.durationMs > 0 ? Math.min(1, elapsed / legInfo.durationMs) : 1;
    return {
      fraction: legInfo.consumedFraction + (1 - legInfo.consumedFraction) * segmentFraction,
      remainingMs: legInfo.durationMs * (1 - segmentFraction),
    };
  };

  // Manual pause button and the tab-visibility effect below both funnel
  // through here — freezes the current leg exactly where it is (see
  // AvatarRunner's frozenFraction prop) instead of letting its CSS
  // transition keep running unseen behind the pause screen.
  const pauseGame = () => {
    if (stage !== "playing" || paused) return;
    const snapshot = phaseProgress();
    remainingMsRef.current = snapshot.remainingMs;
    setFrozenFraction(snapshot.fraction);
    setPaused(true);
  };

  const resumeGame = () => {
    if (frozenFraction !== null) {
      setLegInfo((prev) => ({ ...prev, durationMs: remainingMsRef.current, consumedFraction: frozenFraction }));
      phaseStartRef.current = gameNow();
      setLegToken((token) => token + 1);
    }
    setFrozenFraction(null);
    setPaused(false);
  };

  // Auto-pause the instant the child switches tabs/minimizes the window —
  // same treatment as the manual pause button, so nothing keeps running
  // (and no life gets silently lost) while the game isn't visible. No
  // dependency array — re-registers on every render so the listener always
  // closes over the latest pauseGame (cheap; addEventListener churn here is
  // negligible for a minigame).
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) pauseGame();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  });

  // P/p toggles pause, same as the button — checked via event.code (the
  // physical key), not event.key, so it also fires as the same key types
  // "з"/"З" under a Ukrainian/Russian keyboard layout instead of only
  // working while the layout happens to be English. Same "no dependency
  // array" idiom as the visibilitychange effect above.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyP") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (paused) resumeGame();
      else pauseGame();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const startNextRound = (nextIndex: number) => {
    if (nextIndex >= QUESTION_COUNT) {
      setStage("victory");
      return;
    }
    setIndex(nextIndex);
    setQuestion(generateQuestion(operation, level, choiceCount, question));
    setLocked(false);
    setHasCorrectAnswer(false);
    setSelectedIndex(null);
    beginPhase("running", 0, (RUN_DURATION_S / speed) * 1000);
  };

  const handleAvatarTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if ((phase === "running" || phase === "rushing") && event.propertyName === "left") {
      if (hasCorrectAnswer) {
        beginPhase("crossing", PIT_START, CROSS_DURATION_S * 1000);
      } else {
        beginPhase("falling", PIT_START, FALL_DURATION_S * 1000);
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
    if (stage !== "playing" || phase !== "running" || locked || paused || !question) return;
    setLocked(true);
    setSelectedIndex(choiceIndex);
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
    const { fraction } = phaseProgress();
    beginPhase("rushing", lerp(0, PIT_START, fraction), RUSH_DURATION_S * 1000);
  };

  // Keys 1-N (N = the current question's choice count) mirror clicking the
  // matching hotbar slot.
  useEffect(() => {
    if (stage !== "playing" || phase !== "running" || locked || paused || !question) return;
    const slotCount = question.choices.length;
    const handleKeyDown = (event: KeyboardEvent) => {
      const slot = Number(event.key);
      if (Number.isInteger(slot) && slot >= 1 && slot <= slotCount) handleSelect(slot - 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, phase, locked, paused, question]);

  const avatarMood: RaccoonMood = phase === "crossing" ? "happy" : phase === "falling" ? "sad" : "idle";

  const columns = question.choices.length;
  const [hotbarRef, hotbarWidth] = useElementWidth<HTMLDivElement>();
  const maxDigits = Math.max(1, ...question.choices.map((choice) => String(choice).length));
  const HOTBAR_GAP_PX = 8; // gap-2
  const slotWidth = hotbarWidth > 0 ? (hotbarWidth - HOTBAR_GAP_PX * (columns - 1)) / columns : 0;
  const hotbarFontSize = slotWidth > 0 ? hotbarFontSizePx(slotWidth, maxDigits) : undefined;
  const hintKeyNumber = showHint ? timesTableKeyNumber(question) : null;

  return (
    <div className="relative flex h-full w-full flex-1 flex-col items-center gap-2 overflow-hidden">
      {stage === "playing" && question && (
        <>
          {/* Same absolute top-4 row as MathGame's settings gear (left-20)
              and music toggle (left-32) — left-44 keeps it clear of both
              those and the site-wide fixed Home button (left-4 top-20),
              which a grid cell inside the stats bar below used to collide
              with. */}
          <button
            type="button"
            aria-label={t("pauseButton")}
            onClick={pauseGame}
            className="absolute left-44 top-4 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
          >
            ⏸️
          </button>
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

          <div className="flex shrink-0 items-center justify-center gap-3">
            <QuestionCloud>
              {question.operation === "count" ? (
                <div className="flex flex-col items-center gap-1">
                  <p className="text-xs font-bold text-gray-500 sm:text-sm">{t("countPrompt")}</p>
                  {question.a > 0 && (
                    <div className="flex max-w-[280px] flex-wrap items-center justify-center gap-1 sm:max-w-[420px]">
                      {Array.from({ length: question.a }, (_, i) => {
                        // question.emojiSizes is only set from level 4 up
                        // (see COUNT_LEVELS) — undefined below that, where
                        // every animal renders at the same base size.
                        const sizeMultiplier = question.emojiSizes?.[i] ?? 1;
                        const fontSizeRem = countEmojiSizeRem(question.a) * sizeMultiplier;
                        return (
                          <span key={i} style={{ fontSize: `${fontSizeRem}rem` }} aria-hidden="true">
                            {question.emoji}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-4xl font-extrabold text-gray-800 sm:text-6xl">
                  {question.a} {OPERATOR_SYMBOL[question.operation]} {question.b} = ?
                </p>
              )}
            </QuestionCloud>
            {/* Only once a wrong choice is locked in (never for a correct
                one, which already gets its own bridge/crossing feedback) —
                stays up through the rushing/falling animations until
                startNextRound resets `locked`, giving the child time to
                actually read it before the next round appears. */}
            {locked && !hasCorrectAnswer && (
              <p className="max-w-[8rem] text-left text-sm font-bold text-rose-600 sm:max-w-[10rem] sm:text-lg">
                {t("correctAnswerLabel", { answer: question.answer })}
              </p>
            )}
          </div>

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
              key={legToken}
              phase={phase}
              fromPercent={legInfo.fromPercent}
              initialFraction={legInfo.consumedFraction}
              durationMs={legInfo.durationMs}
              frozenFraction={frozenFraction}
              mood={avatarMood}
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
              const status: SlotStatus = locked
                ? i === selectedIndex && !hasCorrectAnswer
                  ? "incorrect"
                  : "dimmed"
                : "default";
              return (
                <HotbarSlot
                  key={`${choice}-${i}`}
                  value={choice}
                  status={status}
                  disabled={locked || paused}
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
        <div className="relative flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <VictoryConfetti />
          <div ref={victoryBadgeRef} className="relative z-10" style={{ animation: "score-pop 0.4s ease-out" }} aria-hidden="true">
            <RunnerAvatar mood="happy" className="h-40 w-40 sm:h-56 sm:w-56" />
            <div className="absolute -right-2 -top-1 text-4xl">🏆</div>
          </div>
          <p className="relative z-10 text-2xl font-extrabold text-gray-800">{t("victoryTitle")}</p>
          <p className="relative z-10 text-lg font-semibold text-gray-600">
            {t("solvedCount", { count: solvedCount, total: QUESTION_COUNT })}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="relative z-10 rounded-full bg-emerald-500 px-8 py-3 text-lg font-bold text-white shadow-lg transition-transform active:scale-95"
          >
            {t("retryButton")}
          </button>
        </div>
      )}

      {paused && stage === "playing" && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
          {/* Fits everything (title, up to a 2-column x5-row times table,
              button) without ever needing to scroll — a 2-column grid lands
              all TIMES_TABLE_MAX=10 lines in 5 short rows instead of one
              tall list, which is what forced the old single-column version
              to scroll inside its own small box. */}
          <div
            className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl bg-white p-6 text-center shadow-2xl"
            style={{ animation: "score-pop 0.25s ease-out" }}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-4xl" aria-hidden="true">
              ⏸️
            </div>
            <p className="text-2xl font-extrabold text-gray-800">{t("pausedTitle")}</p>
            {hintKeyNumber !== null && (
              <div className="grid w-full grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-gray-50 p-4 text-base font-bold text-gray-700">
                {Array.from({ length: TIMES_TABLE_MAX }, (_, i) => i + 1).map((multiplier) => (
                  <p key={multiplier} className="whitespace-nowrap">
                    {hintKeyNumber} × {multiplier} = {hintKeyNumber * multiplier}
                  </p>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={resumeGame}
              className="w-full rounded-full bg-emerald-500 px-8 py-3 text-lg font-bold text-white shadow-lg transition-transform active:scale-95"
            >
              {t("resumeButton")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MathGame() {
  // Ducks the background track while the run's pause screen is up (manual
  // pause or a tab switch — see MathRun's usePausableClock/pauseGame) —
  // MathRun reports its pause state up via onPauseChange since it owns the
  // pause/resume logic itself.
  const [gamePaused, setGamePaused] = useState(false);
  useBackgroundMusic(gamePaused);
  const t = useTranslations("MathGame");
  const speed = useMathGameStore((s) => s.speed);
  const setSpeed = useMathGameStore((s) => s.setSpeed);
  const choiceCount = useMathGameStore((s) => s.choiceCount);
  const setChoiceCount = useMathGameStore((s) => s.setChoiceCount);
  const operation = useMathGameStore((s) => s.operation);
  const setOperation = useMathGameStore((s) => s.setOperation);
  const level = useMathGameStore((s) => s.level);
  const setLevel = useMathGameStore((s) => s.setLevel);
  const showHint = useMathGameStore((s) => s.showHint);
  const setShowHint = useMathGameStore((s) => s.setShowHint);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const maxLevel = MAX_LEVEL_BY_OPERATION[operation];
  // Remounting MathRun on retry (rather than resetting its state
  // in place) resets useDiamondMilestoneReward's once-per-mount dedupe too
  // — same "key={...}" trick as cards-game.tsx's CardsLevel, so a fresh
  // playthrough that reaches Victory again earns another Diamond.
  const [playToken, setPlayToken] = useState(0);
  const [rootRef, fillHeight] = useViewportFillHeight<HTMLDivElement>();

  // Closes the settings panel on a click/tap outside it — same pattern as
  // balloon-pop-game.tsx/reading-game.tsx/cards-game.tsx/jumping-frogs-game.tsx.
  useEffect(() => {
    if (!settingsOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (settingsPanelRef.current?.contains(target)) return;
      if (settingsButtonRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [settingsOpen]);

  return (
    <div
      ref={rootRef}
      style={{ height: fillHeight }}
      className="relative flex flex-1 flex-col items-center overflow-hidden"
    >
      <button
        ref={settingsButtonRef}
        type="button"
        aria-label={t("settingsButton")}
        onClick={() => setSettingsOpen((current) => !current)}
        className="absolute left-20 top-4 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        ⚙️
      </button>
      <MusicToggleButton className="absolute left-32 top-4 z-10" />

      {settingsOpen && (
        <div
          ref={settingsPanelRef}
          className="absolute left-20 top-16 z-10 flex w-64 flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-lg ring-2 ring-gray-200"
        >
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
          {(operation === "multiply" || operation === "divide") && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showHint} onChange={(e) => setShowHint(e.target.checked)} />
              <span className="font-medium text-gray-700">{t("showHintLabel")}</span>
            </label>
          )}
        </div>
      )}

      <MathRun
        key={playToken}
        speed={speed}
        operation={operation}
        level={level}
        choiceCount={choiceCount}
        showHint={showHint}
        onRetry={() => setPlayToken((token) => token + 1)}
        onPauseChange={setGamePaused}
      />
    </div>
  );
}
