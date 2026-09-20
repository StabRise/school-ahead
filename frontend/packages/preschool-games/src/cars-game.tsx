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
  pointAtT,
  type TurnDirection,
  type TurnKind,
  waypointsToPathD,
} from "./lib/cars-game";
import { useBackgroundMusic } from "./lib/use-background-music";
import { playCocktailBounceSound, playVictoryFanfare } from "./kit/sound-effects";
import { GAME_MUSIC_BUTTON_POSITION, GAME_SETTINGS_BUTTON_POSITION, GAME_SETTINGS_PANEL_POSITION } from "./kit/game-controls";
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
// single generated winding road to a random destination). Nav-app style:
// the car sprite stays fixed, always pointing straight up the screen; the
// map itself pans AND rotates underneath it (see mapRotationDeg) so the
// direction the road actually goes still always matches what's on screen
// (same invariant TurnDirection's own comment describes), it's just that
// "going straight" now always means "up" no matter which way the route
// itself is headed at that point — same as a phone GPS in course-up mode.
// The keyboard control (no on-screen buttons) follows suit: holding ↑
// always drives forward, and only a real upcoming turn ever asks for ←/→.
// At each intersection the upcoming turn (or "keep going straight") shows
// as a small arrow + label at the top of the screen, right after the
// destination line (see CarsTurnInfo), and is voice-narrated once (see
// TURN_PHRASES); once the car has actually turned, both revert to "go
// straight" for the next block rather than continuing to announce the turn
// that's already done (see CarsRouteTurn's own `kind` field in
// lib/cars-game.ts). See that file's own header comment for why each round
// generates exactly one path rather than a real branching road network.

// Spoken instructions are hardcoded Ukrainian phrases (not next-intl keys)
// same as cocktail-game.tsx's own PRAISE_PHRASES/REJECT_PHRASES — speech
// content is independent of the on-screen labels in uk.json.
const TURN_PHRASES: Record<TurnKind, string> = {
  straight: "Проїдь прямо!",
  right: "Поверни направо!",
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

// Horizontal fraction of the viewport where the car sprite sits, fixed for
// the whole drive — dead center, per this feature's own request. Nav-app
// style: the car itself never moves on screen, the map pans (and rotates,
// see mapRotationDeg) underneath it instead, always keeping this exact
// point pinned to wherever the car currently is along the route.
const CAMERA_ANCHOR_X = 0.5;

// The car's own fixed rendered size (see its className below — no
// responsive sm: variant, specifically so this stays exact) and how far
// above the viewport's bottom edge its bottom edge sits for the whole
// drive — per this feature's own request: "виїджає зовсім трохи - щоб її
// стало видно, але нижній край був рівний низу екрана + 5 пікселів". The
// car's own left/top position the sprite's CENTER (see its
// translate(-50%,-50%)), so the target center-Y is back-computed from the
// desired bottom-edge position.
const CAR_HEIGHT_PX = 56;
const CAR_BOTTOM_MARGIN_PX = 5;

// A randomly generated route's actual vertical rise (start to destination,
// before any turns bend it sideways) varies round to round, so the whole
// route is uniformly scaled (never distorting its right-angle corners) to
// land in a sensible on-screen size regardless — same zoom-level role a
// real nav app's own auto-zoom plays. (With the map now rotating to track
// the car's heading — see mapRotationDeg — the destination's on-screen
// position moves around as the car turns rather than staying pinned to a
// fixed height, same as any course-up GPS view; this scale only ever
// controls overall zoom, not where the destination marker lands.)
const TARGET_DESTINATION_Y = 0.10;
const MIN_ROUTE_SCALE = 0.35;
const MAX_ROUTE_SCALE = 1.6;

// Cumulative map rotation (deg) after `turnIndex` turns have been crossed —
// -90° per right turn, +90° per left, unchanged for a straight-through
// crossing (see CarsRouteTurn's `kind`). Built up incrementally like this
// (rather than derived fresh each frame from the car's raw current heading)
// so it only ever changes by a clean ±90°/0° step at a time, with no
// wraparound risk from the underlying heading's own -180°/180° branch cut —
// a CSS transition on this value (see the world div below) would otherwise
// occasionally spin most of the way around instead of a quick quarter turn.
function cumulativeMapRotationDeg(turns: CarsRoute["turns"], turnIndex: number): number {
  let deg = 0;
  for (let i = 0; i < turnIndex; i++) {
    if (turns[i].kind === "right") deg -= 90;
    else if (turns[i].kind === "left") deg += 90;
  }
  return deg;
}

// A small original top-down car — nose pointing up, drawn from scratch (not
// the emoji catalog, which is side-view and only used for the static
// parked-cars illustration). Always rendered pointing straight up: nav-app
// style, the sprite itself never rotates — the map does (see
// mapRotationDeg), same as a phone GPS's course-up "puck". Matches this
// codebase's existing convention of small inline SVG icons (e.g.
// game-choice.tsx's CarIcon) rather than an image asset.
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

// Rotation for an up-pointing chevron — a fixed lookup off the relative
// turn kind (straight/left/right), consistent with the sprite/map's own
// course-up convention: "straight" always draws pointing up, regardless of
// the road's actual absolute heading at that point.
const TURN_KIND_ROTATION: Record<TurnKind, number> = { straight: 0, right: 90, left: -90 };

function DirectionArrowIcon({ kind, className = "h-6 w-6" }: { kind: TurnKind; className?: string }) {
  const rotation = TURN_KIND_ROTATION[kind];
  return (
    <svg viewBox="0 0 24 24" className={`${className} text-amber-600`} style={{ transform: `rotate(${rotation}deg)` }} aria-hidden="true">
      <path d="M12 2 L20 12 L14 12 L14 22 L10 22 L10 12 L4 12 Z" fill="currentColor" />
    </svg>
  );
}

// Shown right after the destination line at the top of the driving viewport
// (see CarsDrivingStage) for the whole drive — an arrow plus label for
// whichever way the car currently needs to go (`activeKind`: "straight" for
// the whole of every block, the actual turn only right at an intersection),
// updating live rather than only popping in near a turn: that on/off
// mounting used to retrigger this component's own entrance animation every
// time, reading as a distracting flicker each time a turn's decision zone
// was entered/left. Replaces the old floating road-sign card; `shakeToken`
// still shakes it on a wrong key press (see handleHoldStart), same as that
// card used to.
function CarsTurnInfo({ kind, shakeToken }: { kind: TurnKind; shakeToken: number }) {
  const t = useTranslations("CarsGame");
  const label: Record<TurnKind, string> = {
    straight: t("driveUpLabel"),
    right: t("turnRightLabel"),
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
      <DirectionArrowIcon kind={kind} />
      {label[kind]}
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

// How long the map's own quarter turn (see mapRotationDeg) eases over once
// the car actually crosses a turn's waypoint — a quick, decisive pivot, not
// a lazy drift.
const ROTATE_TRANSITION_MS = 300;

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

  // Uniform per-round zoom scale — see TARGET_DESTINATION_Y's own comment.
  // start.y is always 0 (see lib/cars-game.ts's buildRoad), so this scales
  // everything relative to the fixed start point without needing a separate
  // offset. Waits for a real viewport size rather than computing against
  // {0,0}. The car's fixed screen center-Y for the whole drive — see
  // CAR_BOTTOM_MARGIN_PX's own comment.
  const carScreenY = viewportSize.height - CAR_BOTTOM_MARGIN_PX - CAR_HEIGHT_PX / 2;
  const netRise = route.waypoints[0].y - route.waypoints[route.waypoints.length - 1].y;
  const routeScale = viewportReady
    ? Math.min(MAX_ROUTE_SCALE, Math.max(MIN_ROUTE_SCALE, (carScreenY - viewportSize.height * TARGET_DESTINATION_Y) / netRise))
    : 1;
  const scaledWaypoints = route.waypoints.map((p) => ({ x: p.x * routeScale, y: p.y * routeScale }));

  const pendingTurn = turnIndex < route.turns.length ? route.turns[turnIndex] : null;
  const legTargetT = pendingTurn ? pendingTurn.t : 1;
  const arrived = progressT >= 1;
  const targetPoint = toCanvasPoint(pointAtT(scaledWaypoints, progressT));
  // Within this leg's final stretch (or already past it, clamped), the held
  // key has to actually turn to keep moving; anywhere earlier in the leg
  // (or once there's no turn left at all), holding "up" — drive straight —
  // is all that's needed. CarsTurnInfo (at the top of the screen) and the
  // turn's own narration both key off this same `activeKind`.
  const atDecisionPoint = pendingTurn !== null && progressT >= pendingTurn.t - TURN_EPSILON;
  const activeKind: TurnKind = atDecisionPoint && pendingTurn ? pendingTurn.kind : "straight";
  const requiredDirection: TurnDirection = activeKind === "straight" ? "up" : activeKind;

  // Mirrors this render's requiredDirection into a ref (outside render, per
  // React's rules-of-refs) so the stable (empty-deps) keydown handler below
  // can read the current requirement at press-time without needing to
  // resubscribe on every progressT tick.
  const requiredDirectionRef = useRef(requiredDirection);
  useEffect(() => {
    requiredDirectionRef.current = requiredDirection;
  });

  // Nav-app style: the car sprite is fixed on screen (see CAMERA_ANCHOR_X/
  // carScreenY); the map pans AND rotates underneath it instead, every
  // frame re-pinning the car's CURRENT point (not just its start point) to
  // that fixed screen position — see cumulativeMapRotationDeg's own comment
  // for why the rotation angle is built incrementally rather than derived
  // fresh from the raw heading each frame. transformOrigin is set to that
  // same current point (in the world div's own local/canvas coordinates,
  // matching how the svg road/destination marker are positioned below), so
  // the rotation pivots exactly on the point the translate then re-pins —
  // that point's own screen position ends up depending only on the
  // translate, never on the rotation, no matter what the rotation currently
  // is (mid-transition included).
  const mapRotationDeg = cumulativeMapRotationDeg(route.turns, turnIndex);
  const worldX = viewportSize.width * CAMERA_ANCHOR_X - targetPoint.x;
  const worldY = carScreenY - targetPoint.y;

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
    if (atDecisionPoint && pendingTurn) sayUk(TURN_PHRASES[pendingTurn.kind], muted);
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
  // just "at a decision point") — mid-block the requirement is always "up"
  // (drive straight, see activeKind), so pressing anything else is just as
  // genuinely wrong as picking the wrong turn.
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
        {!arrived && <CarsTurnInfo kind={activeKind} shakeToken={shakeToken} />}
      </div>

      <div ref={setViewportRef} className="relative w-full flex-1 overflow-hidden rounded-2xl bg-gradient-to-b from-sky-200 to-emerald-200">
        {viewportReady && (
          <>
            {/* The map, two nested layers so panning and rotating don't
                fight each other: the OUTER layer only translates, raw and
                untransitioned every single rAF frame (a CSS transition here
                would visibly lag behind the continuous updates); the INNER
                layer only rotates, WITH a transition, so a turn eases
                smoothly over ROTATE_TRANSITION_MS instead of snapping. Both
                pivot/re-pin around the car's CURRENT point — see
                worldX/worldY/mapRotationDeg's own comments above for why
                that keeps the car pinned on screen regardless of either. */}
            <div
              className="absolute left-0 top-0"
              style={{ width: WORLD_CANVAS_SIZE, height: WORLD_CANVAS_SIZE, transform: `translate(${worldX}px, ${worldY}px)` }}
            >
              <div
                style={{
                  width: WORLD_CANVAS_SIZE,
                  height: WORLD_CANVAS_SIZE,
                  transformOrigin: `${targetPoint.x}px ${targetPoint.y}px`,
                  transform: `rotate(${mapRotationDeg}deg)`,
                  transition: `transform ${ROTATE_TRANSITION_MS}ms ease-out`,
                }}
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
              </div>
            </div>

            {/* Only one car is driven/controlled, regardless of how many
                were marked as departing in the parking stage — per this
                feature's own request, simpler for the child to track than a
                whole convoy. Nav-app style: fixed on screen at
                (CAMERA_ANCHOR_X, carScreenY), always pointing straight up —
                the map (above) does all the panning and rotating instead. */}
            <div
              // No responsive sm: size variant here — fixed at h-14 (56px)
              // to match CAR_HEIGHT_PX exactly, which carScreenY depends on.
              className="absolute h-14 w-8"
              style={{
                left: viewportSize.width * CAMERA_ANCHOR_X,
                top: carScreenY,
                transform: "translate(-50%, -50%)",
              }}
            >
              <CarTopDownSprite className="h-full w-full drop-shadow" />
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

// How long the "only equations" celebration (confetti + praise) stays on
// screen before auto-advancing straight into the next equation — no button
// to tap, per this feature's own request ("поздравление з конфеті і слід
// приклад"), matching the parking stage's own auto-advance pacing
// (NEXT_STAGE_DELAY_MS) rather than the longer arrival celebration.
const EQUATION_CELEBRATION_MS = 1800;

// Shown in place of the driving stage when `onlyEquations` is on — the
// round already ended the moment the parking-stage equation was solved, so
// this is purely a congratulatory beat before CarsRound remounts fresh (see
// CarsGame's roundToken) for the next приклад.
function CarsEquationCelebration({ onDone }: { onDone: () => void }) {
  const t = useTranslations("CarsGame");

  useEffect(() => {
    const timeout = setTimeout(onDone, EQUATION_CELEBRATION_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex w-full flex-1 flex-col items-center justify-center gap-4 overflow-hidden py-2">
      <CarsConfetti />
      <p className="z-10 text-2xl font-extrabold text-emerald-700 sm:text-3xl" style={{ animation: "score-pop 0.4s ease-out" }}>
        {t("equationCelebrationTitle")}
      </p>
    </div>
  );
}

type RoundPhase = "parking" | "driving" | "celebrating";

// One full round: a fresh equation + route, played parking -> driving ->
// arrival — or, with `onlyEquations` on, parking -> celebrating straight
// back into a fresh round, skipping the drive entirely. Remounted wholesale
// via `key` (see CarsGame below) once the round ends — same
// reset-everything-at-once idiom as cocktail-game.tsx's CocktailRound.
function CarsRound({
  muted,
  onlyEquations,
  onWin,
}: {
  muted: boolean;
  onlyEquations: boolean;
  onWin: () => void;
}) {
  const [equation] = useState<CarsEquation>(generateCarsEquation);
  const [route] = useState<CarsRoute>(generateCarsRoute);
  const [roundPhase, setRoundPhase] = useState<RoundPhase>("parking");

  if (roundPhase === "parking") {
    return (
      <CarsParkingStage
        equation={equation}
        muted={muted}
        onSolved={() => {
          if (onlyEquations) playVictoryFanfare();
          setRoundPhase(onlyEquations ? "celebrating" : "driving");
        }}
      />
    );
  }
  if (roundPhase === "celebrating") {
    return <CarsEquationCelebration onDone={onWin} />;
  }
  return <CarsDrivingStage route={route} muted={muted} onDone={onWin} />;
}

export function CarsGame() {
  const t = useTranslations("CarsGame");
  const muted = useCarsGameStore((s) => s.muted);
  const setMuted = useCarsGameStore((s) => s.setMuted);
  const onlyEquations = useCarsGameStore((s) => s.onlyEquations);
  const setOnlyEquations = useCarsGameStore((s) => s.setOnlyEquations);
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
        className={`${GAME_SETTINGS_BUTTON_POSITION} flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200`}
      >
        ⚙️
      </button>

      {settingsOpen && (
        <div
          ref={settingsPanelRef}
          className={`${GAME_SETTINGS_PANEL_POSITION} flex w-56 flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-lg ring-2 ring-gray-200`}
        >
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            <span className="font-medium text-gray-700">{t("mutedLabel")}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={onlyEquations} onChange={(e) => setOnlyEquations(e.target.checked)} />
            <span className="font-medium text-gray-700">{t("onlyEquationsLabel")}</span>
          </label>
        </div>
      )}

      <MusicToggleButton className={GAME_MUSIC_BUTTON_POSITION} />

      <CarsRound key={roundToken} muted={muted} onlyEquations={onlyEquations} onWin={() => setRoundToken((n) => n + 1)} />
    </div>
  );
}
