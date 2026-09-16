"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRewardCarsGame } from "@school-ahead/api-client/browser/auth/auth";
import { prefetchVoice, speak, warmupSpeech } from "@school-ahead/api-client";
import {
  buildCarsAnswerChoices,
  CAR_EMOJI,
  type CarsEquation,
  type CarsPoint,
  type CarsRoute,
  generateCarsEquation,
  generateCarsRoute,
  headingToCardinal,
  pointAtT,
  tangentAngleAtT,
  type TurnDirection,
  waypointsToPathD,
} from "./lib/cars-game";
import { useBackgroundMusic } from "./lib/use-background-music";
import { playCocktailBounceSound, playVictoryFanfare } from "./kit/sound-effects";
import { MusicToggleButton } from "./kit/music-toggle-button";
import { useDiamondMilestoneReward } from "./kit/use-diamond-milestone-reward";
import {
  NUMBER_TILE_CLASS,
  NumberTileButton,
  equationFontSizeStyle,
  equationOperatorFontSizeStyle,
  numberTileSizeStyle,
} from "./kit/number-tile";
import { useCarsGameStore } from "./stores/cars-game-store";

// "Машинки" (Parking Math) preschool minigame — see docs/preschool/games/
// cars.md for the design brief. A round has two phases: CarsParkingStage (a
// приклад on subtraction, illustrated by parked cars, answered the same way
// as cocktail-game.tsx's CocktailEquationGate — answer tiles, near-miss
// distractors; the child can also optionally tap `subtract`-many specific
// parked cars beforehand to mark exactly which ones will depart) and, once
// solved, CarsDrivingStage (those specific marked cars — auto-filled from
// the remaining parked ones if the child didn't mark enough — drive a
// single generated winding road to a random destination, one after another
// in a queue, pausing at each intersection for a voice-narrated turn the
// child answers by holding the matching arrow key — no on-screen driving
// buttons any more, keyboard only). At each intersection the upcoming turn
// also shows as a small arrow + label at the top of the screen, right after
// the destination line (see CarsTurnInfo), replacing the old floating road
// sign. See lib/cars-game.ts's own header comment for why each round
// generates exactly one path rather than a real branching road network.

// Spoken instructions are hardcoded Ukrainian phrases (not next-intl keys)
// same as cocktail-game.tsx's own PRAISE_PHRASES/REJECT_PHRASES — speech
// content is independent of the on-screen labels in uk.json.
const TURN_PHRASES: Record<TurnDirection, string> = {
  up: "Проїдь прямо!",
  right: "Поверни направо!",
  down: "Їдь вниз!",
  left: "Поверни наліво!",
};
const ARRIVAL_PHRASES = ["Ура! Приїхали!", "Молодець! Доїхали!"];

function pickPhrase(phrases: string[]): string {
  return phrases[Math.floor(Math.random() * phrases.length)];
}

function sayUk(text: string, muted: boolean): void {
  if (!muted) speak(text, "uk", "short");
}

function randomCarEmoji(): string {
  return CAR_EMOJI[Math.floor(Math.random() * CAR_EMOJI.length)];
}

// Presentational randomness (which of the not-yet-marked parked cars fill
// out the departing group) — kept local to the component, same convention
// as cocktail-game.tsx's randomTablePosition/CocktailConfetti, since it has
// no effect on game logic worth unit-testing in lib/cars-game.ts.
function pickRandomIndices(indices: number[], count: number): number[] {
  const copy = [...indices];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

// --- Parking stage -----------------------------------------------------

// The parked cars are what the child actually counts, so they're drawn as
// large as a single row of `total` of them fits — the per-car share of the
// viewport shrinks as the count grows (3-8, see TOTAL_RANGE in
// lib/cars-game.ts), with a fixed floor and ceiling either side.
function parkedCarFontSize(total: number): string {
  return `clamp(2rem, ${(64 / total).toFixed(1)}vw, 5rem)`;
}

// How long a correctly-picked tile flashes green (see NumberTileButton's
// "correct" status) before the choices row is swapped out for the solved
// equation — same duration as a wrong pick's own red flash below, for a
// matched beat.
const CORRECT_PICK_DELAY_MS = 500;

// How long the solved equation (crossed-out cars, filled-in answer) stays on
// screen before auto-advancing to the driving stage — no "Поїхали" button
// to tap any more, per this feature's own request; just enough of a pause
// for the child to see the equation actually got solved.
const NEXT_STAGE_DELAY_MS = 1500;

function CarsParkingStage({
  equation,
  muted,
  onSolved,
}: {
  equation: CarsEquation;
  muted: boolean;
  onSolved: () => void;
}) {
  const t = useTranslations("CarsGame");
  const [parkedCars] = useState(() => Array.from({ length: equation.total }, randomCarEmoji));
  const [{ choices }] = useState(() => buildCarsAnswerChoices(equation.answer));
  const [wrongIndex, setWrongIndex] = useState<number | null>(null);
  // Set the instant the right tile is picked, then `solved` follows CORRECT_PICK_DELAY_MS
  // later — gives the tile a beat to flash green (see its own NumberTileButton
  // status below) before the choices row is swapped out for the depart button.
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [markedIndices, setMarkedIndices] = useState<Set<number>>(new Set());
  const [solved, setSolved] = useState(false);
  const [departingIndices, setDepartingIndices] = useState<number[]>([]);

  useEffect(() => {
    sayUk("Розв'яжи приклад!", muted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-advances to the driving stage once solved — see NEXT_STAGE_DELAY_MS.
  useEffect(() => {
    if (!solved) return;
    const timeout = setTimeout(onSolved, NEXT_STAGE_DELAY_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved]);

  // Lets the child mark, before answering, exactly which `subtract`-many
  // parked cars will be the ones to depart — tapping one crosses it out;
  // tapping it again un-marks it; tapping a fresh one past the cap plays a
  // "no more room" sound instead of marking it. Purely optional — the child
  // can skip straight to the answer tiles below without marking anything.
  const handleCarTap = (index: number) => {
    if (solved) return;
    setMarkedIndices((current) => {
      if (current.has(index)) {
        const next = new Set(current);
        next.delete(index);
        return next;
      }
      if (current.size >= equation.subtract) {
        playCocktailBounceSound();
        return current;
      }
      return new Set(current).add(index);
    });
  };

  const handlePick = (index: number, value: number) => {
    if (value === equation.answer) {
      const marked = [...markedIndices];
      const stillNeeded = equation.subtract - marked.length;
      const finalDeparting =
        stillNeeded > 0
          ? [...marked, ...pickRandomIndices(parkedCars.map((_, i) => i).filter((i) => !markedIndices.has(i)), stillNeeded)]
          : marked.slice(0, equation.subtract);
      setCorrectIndex(index);
      setTimeout(() => {
        setDepartingIndices(finalDeparting);
        setSolved(true);
      }, CORRECT_PICK_DELAY_MS);
      return;
    }
    playCocktailBounceSound();
    setWrongIndex(index);
    setTimeout(() => setWrongIndex((current) => (current === index ? null : current)), 500);
  };

  const crossedOut = solved ? new Set(departingIndices) : markedIndices;

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-6 sm:gap-8">
      <div className="flex w-full flex-col items-center gap-4 rounded-3xl bg-white/90 px-3 py-5 shadow-lg ring-4 ring-white sm:gap-6 sm:px-8 sm:py-7">
        <span className="text-sm font-bold text-gray-500 sm:text-base">{t("equationLabel")}</span>
        <div className="flex items-center justify-center gap-2 font-extrabold text-gray-800 sm:gap-5" style={equationFontSizeStyle}>
          <span>{equation.total}</span>
          <span className="text-gray-400" style={equationOperatorFontSizeStyle}>
            −
          </span>
          <span>{equation.subtract}</span>
          <span className="text-gray-400" style={equationOperatorFontSizeStyle}>
            =
          </span>
          <span
            style={numberTileSizeStyle}
            className={`${NUMBER_TILE_CLASS} ${
              solved ? "border-emerald-400 bg-emerald-100 text-emerald-700 ring-4 ring-emerald-300" : "border-dashed border-gray-300 text-gray-300"
            }`}
          >
            {solved ? equation.answer : "?"}
          </span>
        </div>
        <div
          className="flex flex-wrap items-center justify-center gap-1"
          style={{ fontSize: parkedCarFontSize(equation.total) }}
        >
          {parkedCars.map((emoji, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={crossedOut.has(i)}
              disabled={solved}
              onClick={() => handleCarTap(i)}
              // inline-flex + items/justify-center + leading-none + p-0 —
              // a plain <button> otherwise keeps its own padding and the
              // font's line-height box around the glyph, both of which
              // shift the emoji's visual center away from the button's own
              // geometric center that the strikethrough bar below is
              // centered on, throwing the bar visibly off the car.
              className={`relative inline-flex items-center justify-center p-0 leading-none transition ${
                solved ? "cursor-default" : "cursor-pointer hover:scale-110"
              } ${crossedOut.has(i) ? "opacity-70" : ""}`}
            >
              {emoji}
              {crossedOut.has(i) && (
                // A diagonal bottom-left-to-top-right bar (not CSS
                // text-decoration, which can only draw a horizontal line)
                // — per this feature's own request, "закреслення з лівого
                // нижнього кута до правого верхнього".
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[0.1em] w-[120%] rounded-full bg-rose-500"
                  style={{ transform: "translate(-50%, -50%) rotate(-45deg)" }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {!solved && (
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {choices.map((value, index) => (
            <NumberTileButton
              key={index}
              value={value}
              status={wrongIndex === index ? "incorrect" : correctIndex === index ? "correct" : "default"}
              disabled={correctIndex !== null}
              onClick={() => handlePick(index, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Driving stage -------------------------------------------------------

// World coordinates (see lib/cars-game.ts's generateCarsRoute) are centered
// on (0,0) — a road with up to 5 turns has 6 straight 130px blocks, so a
// run that never turns can drift up to 780px from the start in a single
// direction, and the per-round scale below (see routeScale) can stretch
// that up to MAX_ROUTE_SCALE more. Shifting by this much before drawing
// keeps everything comfortably positive so a plain absolutely-positioned
// <svg> (no viewBox scaling trickery) can hold the whole route.
const WORLD_SHIFT = 1300;
const WORLD_CANVAS_SIZE = 2600;

function toCanvasPoint(p: CarsPoint): CarsPoint {
  return { x: p.x + WORLD_SHIFT, y: p.y + WORLD_SHIFT };
}

function shiftWaypoints(waypoints: CarsPoint[]): CarsPoint[] {
  return waypoints.map(toCanvasPoint);
}

// Horizontal fraction of the viewport where the road's start point (the
// parking-lot exit) sits — dead center, per this feature's own request.
// Fixed for the whole stage (computed from route.waypoints[0], not the
// car's current position) — the camera itself never pans; only the car
// sprite moves.
const CAMERA_ANCHOR_X = 0.5;

// The car's own fixed rendered size (see its className below — no
// responsive sm: variant, specifically so this stays exact) and how far
// above the viewport's bottom edge its bottom edge should sit at the very
// start of the journey — per this feature's own request: "виїджає зовсім
// трохи - щоб її стало видно, але нижній край був рівний низу екрана + 5
// пікселів". `left`/`top` position the sprite's CENTER (see its
// translate(-50%,-50%)), so the target center-Y is back-computed from the
// desired bottom-edge position.
const CAR_HEIGHT_PX = 56;
const CAR_BOTTOM_MARGIN_PX = 5;

// The destination should always read as "way up there" — comfortably
// inside the top 30% of the screen, per this feature's own request — while
// the X position is left to fall wherever the route's own turns take it
// (no separate horizontal targeting needed). Since a randomly generated
// route's actual vertical rise varies round to round, the whole route is
// uniformly scaled (never distorting its right-angle corners) so the
// destination lands at this exact screen-height fraction regardless.
const TARGET_DESTINATION_Y = 0.10;
const MIN_ROUTE_SCALE = 0.35;
const MAX_ROUTE_SCALE = 1.6;

// CarTopDownSprite (below) is drawn nose-up (heading -90° in our own
// atan2(dy,dx) convention), so a plain rotation aligns it with any desired
// heading — unlike a side-view car emoji (see this function's own git
// history), a top-down sprite is fully rotationally symmetric: no
// mirroring or per-direction special-casing needed for any of the 4
// cardinal headings this grid road ever asks for.
function carDirectionTransform(headingRad: number): string {
  return `rotate(${(headingRad * 180) / Math.PI + 90}deg)`;
}

// A small original top-down car — nose pointing up, drawn from scratch
// (not the emoji catalog, which is side-view and only used for the static
// parked-cars illustration) so it can rotate cleanly to any of the road's
// 4 headings. Matches this codebase's existing convention of small inline
// SVG icons (e.g. game-choice.tsx's CarIcon) rather than an image asset.
function CarTopDownSprite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 70" className={className} aria-hidden="true">
      <rect x="2" y="12" width="6" height="16" rx="3" fill="#1f2937" />
      <rect x="32" y="12" width="6" height="16" rx="3" fill="#1f2937" />
      <rect x="2" y="42" width="6" height="16" rx="3" fill="#1f2937" />
      <rect x="32" y="42" width="6" height="16" rx="3" fill="#1f2937" />
      <rect x="6" y="2" width="28" height="66" rx="12" fill="#ef4444" stroke="#b91c1c" strokeWidth="2" />
      <rect x="11" y="10" width="18" height="14" rx="4" fill="#bae6fd" />
      <rect x="11" y="47" width="18" height="10" rx="4" fill="#bae6fd" opacity="0.8" />
      <circle cx="12" cy="7" r="2" fill="#fef08a" />
      <circle cx="28" cy="7" r="2" fill="#fef08a" />
    </svg>
  );
}

interface ViewportSize {
  width: number;
  height: number;
}

const EMPTY_VIEWPORT_SIZE: ViewportSize = { width: 0, height: 0 };

// Measures the driving viewport's own rendered size live (ResizeObserver) —
// same pattern as jumping-frogs-game.tsx's usePondSize.
function useViewportSize(): [(el: HTMLDivElement | null) => void, ViewportSize] {
  const [size, setSize] = useState<ViewportSize>(EMPTY_VIEWPORT_SIZE);
  const observerRef = useRef<ResizeObserver | null>(null);

  const setRef = (el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    observerRef.current = observer;
  };

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return [setRef, size];
}

// Rotation for an up-pointing chevron — direction is an absolute screen
// cardinal (see TurnDirection's own comment), so this is a plain fixed
// lookup, not anything derived from the car's current heading.
const CARDINAL_ROTATION: Record<TurnDirection, number> = { up: 0, right: 90, down: 180, left: -90 };

function DirectionArrowIcon({ direction, className = "h-6 w-6" }: { direction: TurnDirection; className?: string }) {
  const rotation = CARDINAL_ROTATION[direction];
  return (
    <svg viewBox="0 0 24 24" className={`${className} text-amber-600`} style={{ transform: `rotate(${rotation}deg)` }} aria-hidden="true">
      <path d="M12 2 L20 12 L14 12 L14 22 L10 22 L10 12 L4 12 Z" fill="currentColor" />
    </svg>
  );
}

// Shown right after the destination line at the top of the driving viewport
// (see CarsDrivingStage) whenever the car is nearing a turn — an arrow plus
// the same direction phrase TURN_PHRASES narrates aloud, telling the child
// which arrow key to hold. Replaces the old floating road-sign card;
// `shakeToken` still shakes it on a wrong key press (see handleHoldStart),
// same as that card used to.
function CarsTurnInfo({ direction, shakeToken }: { direction: TurnDirection; shakeToken: number }) {
  const t = useTranslations("CarsGame");
  const label: Record<TurnDirection, string> = {
    up: t("driveUpLabel"),
    right: t("turnRightLabel"),
    down: t("driveDownLabel"),
    left: t("turnLeftLabel"),
  };
  return (
    <span
      // Re-adding the exact same animation string wouldn't restart it — a
      // per-token no-op timing tweak, same idiom as cocktail-game.tsx's
      // CocktailGlass wobbleToken.
      data-shake={shakeToken}
      style={{ animation: shakeToken > 0 ? "raccoon-shake 0.4s ease-in-out" : "score-pop 0.3s ease-out" }}
      className="flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-amber-700 shadow ring-2 ring-amber-300"
    >
      <DirectionArrowIcon direction={direction} />
      {label[direction]}
    </span>
  );
}

const VICTORY_CONFETTI_EMOJI = ["🎉", "✨", "🚗", "🌟"];

function CarsConfetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 1.5 + Math.random() * 1.1,
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

// How fast the car covers route-progress (0-1) per second while a validated
// direction is held — per-leg t-span is roughly 0.17-0.25 (4-6 segments), so
// this paces each block at a bit over a second, holdable comfortably by a
// preschooler.
const DRIVE_SPEED_T_PER_SEC = 0.15;

// How close to a turn's own t counts as "at" that intersection — the zone
// where the held key has to match the upcoming turn rather than just
// whatever the car is already driving (see requiredDirection below).
const TURN_EPSILON = 0.02;

function CarsDrivingStage({
  route,
  muted,
  onDone,
}: {
  route: CarsRoute;
  muted: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("CarsGame");
  const [setViewportRef, viewportSize] = useViewportSize();
  const viewportReady = viewportSize.width > 0 && viewportSize.height > 0;
  const [progressT, setProgressT] = useState(0);
  // Hold-to-drive, not tap-to-advance — per this feature's own request, the
  // car only advances while this is set to whatever's currently required
  // (see requiredDirection below), and freezes in place the instant it's
  // released. Arrow keys only now — no on-screen buttons any more.
  const [heldDirection, setHeldDirection] = useState<TurnDirection | null>(null);
  const [shakeToken, setShakeToken] = useState(0);
  const celebrationRef = useRef<HTMLParagraphElement>(null);
  const rewardCarsGame = useRewardCarsGame();

  // turnIndex/arrived are pure derivations of progressT (which only ever
  // increases) and route.turns' own thresholds — not separate state, so
  // there's no "commit" effect needed to keep them in sync with it (that
  // pattern trips this codebase's react-hooks/set-state-in-effect lint
  // rule, and the derivation is trivial anyway).
  const turnIndex = route.turns.filter((turn) => progressT >= turn.t).length;

  // Uniform per-round scale so the destination (the route's last waypoint)
  // lands at TARGET_DESTINATION_Y regardless of how far this particular
  // route's random turns happened to rise — start.y is always 0 (see
  // lib/cars-game.ts's buildRoad), so this scales everything relative to
  // the fixed start point without needing a separate offset. Waits for a
  // real viewport size rather than computing against {0,0}.
  // The car's center-Y at the very start of the journey (t=0) — see
  // CAR_BOTTOM_MARGIN_PX's own comment.
  const startCenterY = viewportSize.height - CAR_BOTTOM_MARGIN_PX - CAR_HEIGHT_PX / 2;
  const netRise = route.waypoints[0].y - route.waypoints[route.waypoints.length - 1].y;
  const routeScale = viewportReady
    ? Math.min(MAX_ROUTE_SCALE, Math.max(MIN_ROUTE_SCALE, (startCenterY - viewportSize.height * TARGET_DESTINATION_Y) / netRise))
    : 1;
  const scaledWaypoints = route.waypoints.map((p) => ({ x: p.x * routeScale, y: p.y * routeScale }));

  const pendingTurn = turnIndex < route.turns.length ? route.turns[turnIndex] : null;
  const legTargetT = pendingTurn ? pendingTurn.t : 1;
  const arrived = progressT >= 1;
  const targetPoint = toCanvasPoint(pointAtT(scaledWaypoints, progressT));
  const headingRad = tangentAngleAtT(scaledWaypoints, progressT);
  // Within this leg's final stretch (or already past it, clamped), the held
  // key has to match the actual turn to keep moving — anywhere earlier in
  // the leg, holding whichever absolute direction the car is already
  // driving (headingToCardinal of its current heading) is all that's
  // needed, same as any other stretch of road. CarsTurnInfo (at the top of
  // the screen) and the turn's own narration both key off this too.
  const atDecisionPoint = pendingTurn !== null && progressT >= pendingTurn.t - TURN_EPSILON;
  const requiredDirection: TurnDirection = atDecisionPoint && pendingTurn ? pendingTurn.direction : headingToCardinal(headingRad);

  // Mirrors this render's requiredDirection into a ref (outside render, per
  // React's rules-of-refs) so the stable (empty-deps) keydown handler below
  // can read the current requirement at press-time without needing to
  // resubscribe on every progressT tick.
  const requiredDirectionRef = useRef(requiredDirection);
  useEffect(() => {
    requiredDirectionRef.current = requiredDirection;
  });

  // A fixed placement for the whole stage (the route's own start point
  // pinned so the car's bottom edge sits CAR_BOTTOM_MARGIN_PX above the
  // viewport's bottom edge at t=0) — the world/road never pans; only the
  // car sprite itself moves within it (see its own left/top/transform
  // below).
  const startPoint = toCanvasPoint(scaledWaypoints[0]);
  const worldX = viewportSize.width * CAMERA_ANCHOR_X - startPoint.x;
  const worldY = startCenterY - startPoint.y;

  useDiamondMilestoneReward({
    mode: "level",
    complete: arrived,
    rewardMutation: rewardCarsGame,
    originRef: celebrationRef,
  });

  // Drives progressT forward each frame, but only while the held key
  // actually matches what's currently required — releasing (heldDirection
  // becomes null) or holding the wrong one at an intersection simply stops
  // this from advancing, it doesn't reset anything.
  useEffect(() => {
    if (arrived) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (heldDirection && heldDirection === requiredDirection) {
        setProgressT((current) => Math.min(legTargetT, current + DRIVE_SPEED_T_PER_SEC * dt));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [heldDirection, requiredDirection, legTargetT, arrived]);

  // Speaks a turn's instruction once as its decision zone is first entered
  // — not on every render, so an unrelated re-render doesn't repeat it.
  useEffect(() => {
    if (atDecisionPoint && pendingTurn) sayUk(TURN_PHRASES[pendingTurn.direction], muted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atDecisionPoint, turnIndex]);

  useEffect(() => {
    if (arrived) {
      playVictoryFanfare();
      sayUk(pickPhrase(ARRIVAL_PHRASES), muted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived]);

  // Starts holding a direction — checked synchronously right here (via the
  // requiredDirectionRef mirror above) rather than reactively in a
  // useEffect watching heldDirection, both because it's a direct
  // consequence of this user event (not state syncing from other state) and
  // because it needs the freshest possible read of the requirement, not
  // whatever it was on the last render. Bounces on ANY mismatch now (not
  // just "at a decision point") — mid-block the requirement is whichever
  // absolute direction the car is already driving, so pressing something
  // else is just as genuinely wrong as picking the wrong turn.
  const handleHoldStart = (direction: TurnDirection) => {
    setHeldDirection(direction);
    if (direction !== requiredDirectionRef.current) {
      playCocktailBounceSound();
      setShakeToken((n) => n + 1);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.key === "ArrowLeft") handleHoldStart("left");
      else if (event.key === "ArrowRight") handleHoldStart("right");
      else if (event.key === "ArrowUp") handleHoldStart("up");
      else if (event.key === "ArrowDown") handleHoldStart("down");
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") setHeldDirection((current) => (current === "left" ? null : current));
      else if (event.key === "ArrowRight") setHeldDirection((current) => (current === "right" ? null : current));
      else if (event.key === "ArrowDown") setHeldDirection((current) => (current === "down" ? null : current));
      else if (event.key === "ArrowUp") setHeldDirection((current) => (current === "up" ? null : current));
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return (
    <div className="relative flex w-full flex-1 flex-col items-center gap-4 py-2">
      <div className="z-10 flex flex-wrap items-center justify-center gap-2 text-sm font-bold text-emerald-800/70 sm:text-base">
        <span>
          {t("destinationLabel")} {route.destination.emoji} {route.destination.label}
        </span>
        {atDecisionPoint && pendingTurn && <CarsTurnInfo direction={pendingTurn.direction} shakeToken={shakeToken} />}
      </div>

      <div ref={setViewportRef} className="relative w-full flex-1 overflow-hidden rounded-2xl bg-gradient-to-b from-sky-200 to-emerald-200">
        {viewportReady && (
          <>
            <div
              className="absolute left-0 top-0"
              style={{ width: WORLD_CANVAS_SIZE, height: WORLD_CANVAS_SIZE, transform: `translate(${worldX}px, ${worldY}px)` }}
            >
              <svg width={WORLD_CANVAS_SIZE} height={WORLD_CANVAS_SIZE} className="absolute left-0 top-0" aria-hidden="true">
                <path d={waypointsToPathD(shiftWaypoints(scaledWaypoints))} stroke="#94a3b8" strokeWidth={22} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <path
                  d={waypointsToPathD(shiftWaypoints(scaledWaypoints))}
                  stroke="#f8fafc"
                  strokeWidth={14}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="14 14"
                />
              </svg>
              {(() => {
                const destinationPoint = toCanvasPoint(scaledWaypoints[scaledWaypoints.length - 1]);
                return (
                  <span
                    aria-hidden="true"
                    className="absolute -translate-x-1/2 -translate-y-1/2 text-7xl sm:text-8xl"
                    style={{ left: destinationPoint.x, top: destinationPoint.y }}
                  >
                    {route.destination.emoji}
                  </span>
                );
              })()}

              {/* Only one car is driven/controlled, regardless of how many
                  were marked as departing in the parking stage — per this
                  feature's own request, simpler for the child to track than
                  a whole convoy. The world/road itself is static (see
                  worldX/worldY above); position updates every rAF frame (no
                  CSS transition — it would fight the continuous updates),
                  only the rotation eases so turning in place looks smooth. */}
              <div
                // No responsive sm: size variant here — fixed at h-14 (56px)
                // to match CAR_HEIGHT_PX exactly, which the bottom-margin
                // anchor above depends on.
                className="absolute h-14 w-8 transition-transform duration-300 ease-out"
                style={{ left: targetPoint.x, top: targetPoint.y, transform: `translate(-50%, -50%) ${carDirectionTransform(headingRad)}` }}
              >
                <CarTopDownSprite className="h-full w-full drop-shadow" />
              </div>
            </div>

            {arrived && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 overflow-hidden bg-white/80 text-center">
                <CarsConfetti />
                <p ref={celebrationRef} className="z-10 text-2xl font-extrabold text-emerald-700 sm:text-3xl">
                  {t("celebrationTitle")} {route.destination.emoji}
                </p>
                <button
                  type="button"
                  onClick={onDone}
                  className="preschool-button z-10 rounded-full bg-emerald-500 px-8 py-3 text-lg font-extrabold text-white shadow-lg ring-4 ring-emerald-300 transition hover:scale-105"
                >
                  {t("nextButton")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- Round + top-level shell ----------------------------------------------

type RoundPhase = "parking" | "driving";

// One full round: a fresh equation + route, played parking -> driving ->
// arrival. Remounted wholesale via `key` (see CarsGame below) once the
// child presses "Далі" — same reset-everything-at-once idiom as
// cocktail-game.tsx's CocktailRound.
function CarsRound({ muted, onWin }: { muted: boolean; onWin: () => void }) {
  const [equation] = useState<CarsEquation>(generateCarsEquation);
  const [route] = useState<CarsRoute>(generateCarsRoute);
  const [roundPhase, setRoundPhase] = useState<RoundPhase>("parking");

  if (roundPhase === "parking") {
    return <CarsParkingStage equation={equation} muted={muted} onSolved={() => setRoundPhase("driving")} />;
  }
  return <CarsDrivingStage route={route} muted={muted} onDone={onWin} />;
}

export function CarsGame() {
  const t = useTranslations("CarsGame");
  const muted = useCarsGameStore((s) => s.muted);
  const setMuted = useCarsGameStore((s) => s.setMuted);
  const [roundToken, setRoundToken] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  useBackgroundMusic();

  // Warms up the small, fixed vocabulary of turn/arrival phrases once up
  // front so the first prompt doesn't stall on synthesizing it live — same
  // prefetch+warmup pattern as reading-game.tsx/cards-game.tsx.
  useEffect(() => {
    void prefetchVoice("uk", "short").then(() => {
      warmupSpeech([...Object.values(TURN_PHRASES), ...ARRIVAL_PHRASES], "uk", "short");
    });
  }, []);

  // Closes the settings panel on a click/tap anywhere outside it — same
  // pattern as balloon-pop-game.tsx's own settings panel (the toggle button
  // itself is excluded so tapping it while open just closes it once,
  // instead of this handler closing it and the button's own onClick
  // immediately reopening it).
  useEffect(() => {
    if (!settingsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (settingsPanelRef.current?.contains(target)) return;
      if (settingsButtonRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [settingsOpen]);

  return (
    <div className="relative flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-3xl bg-gradient-to-b from-sky-100 via-emerald-50 to-lime-100 p-2 ring-4 ring-inset ring-white/90 shadow-lg sm:p-4">
      <button
        ref={settingsButtonRef}
        type="button"
        aria-label={t("settingsButton")}
        onClick={() => setSettingsOpen((current) => !current)}
        className="absolute left-4 top-4 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        ⚙️
      </button>

      {settingsOpen && (
        <div
          ref={settingsPanelRef}
          className="absolute left-4 top-16 z-10 flex w-56 flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-lg ring-2 ring-gray-200"
        >
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            <span className="font-medium text-gray-700">{t("mutedLabel")}</span>
          </label>
        </div>
      )}

      <MusicToggleButton className="absolute right-4 top-4 z-10" />

      <CarsRound key={roundToken} muted={muted} onWin={() => setRoundToken((n) => n + 1)} />
    </div>
  );
}
