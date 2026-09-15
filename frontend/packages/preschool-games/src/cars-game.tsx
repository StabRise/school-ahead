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
  tangentAngleAtT,
  type TurnDirection,
  waypointsToPathD,
} from "./lib/cars-game";
import { useBackgroundMusic } from "./lib/use-background-music";
import { playCarHonkSound, playCocktailBounceSound, playVictoryFanfare } from "./kit/sound-effects";
import { MusicToggleButton } from "./kit/music-toggle-button";
import { useDiamondMilestoneReward } from "./kit/use-diamond-milestone-reward";
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
// child answers with arrow keys or on-screen taps). See lib/cars-game.ts's
// own header comment for why each round generates exactly one path rather
// than a real branching road network.

// Spoken instructions are hardcoded Ukrainian phrases (not next-intl keys)
// same as cocktail-game.tsx's own PRAISE_PHRASES/REJECT_PHRASES — speech
// content is independent of the on-screen labels in uk.json.
const TURN_PHRASES: Record<TurnDirection, string> = {
  left: "Поверни наліво!",
  right: "Поверни направо!",
  straight: "Проїдь прямо!",
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

// Same square-tile look as cocktail-game.tsx's EquationAnswerSlot — every
// preschool game re-implements this locally (no shared NumberCard/tile
// component exists in the codebase).
function CarsAnswerSlot({ value, wrong, onClick }: { value: number; wrong: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-14 w-14 items-center justify-center rounded-md border-4 text-xl font-extrabold text-gray-800 shadow-inner transition sm:h-16 sm:w-16 sm:text-2xl ${
        wrong ? "border-red-400 bg-red-100 ring-4 ring-red-300" : "border-gray-400 bg-gray-200 hover:bg-gray-300"
      }`}
    >
      {value}
    </button>
  );
}

function CarsParkingStage({
  equation,
  muted,
  onSolved,
}: {
  equation: CarsEquation;
  muted: boolean;
  onSolved: (departingCars: string[]) => void;
}) {
  const t = useTranslations("CarsGame");
  const [parkedCars] = useState(() => Array.from({ length: equation.total }, randomCarEmoji));
  const [{ choices }] = useState(() => buildCarsAnswerChoices(equation.answer));
  const [wrongIndex, setWrongIndex] = useState<number | null>(null);
  const [markedIndices, setMarkedIndices] = useState<Set<number>>(new Set());
  const [solved, setSolved] = useState(false);
  const [departingIndices, setDepartingIndices] = useState<number[]>([]);

  useEffect(() => {
    sayUk("Розв'яжи приклад!", muted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setDepartingIndices(finalDeparting);
      setSolved(true);
      return;
    }
    playCocktailBounceSound();
    setWrongIndex(index);
    setTimeout(() => setWrongIndex((current) => (current === index ? null : current)), 500);
  };

  const crossedOut = solved ? new Set(departingIndices) : markedIndices;

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-white/90 px-6 py-5 shadow-lg ring-4 ring-white">
        <span className="text-sm font-bold text-gray-500 sm:text-base">{t("equationLabel")}</span>
        <div className="flex items-center justify-center gap-3 text-3xl font-extrabold text-gray-800 sm:gap-4 sm:text-4xl">
          <span>{equation.total}</span>
          <span className="text-gray-400">−</span>
          <span>{equation.subtract}</span>
          <span className="text-gray-400">=</span>
          <span
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-md border-4 text-xl shadow-inner transition sm:h-16 sm:w-16 sm:text-2xl ${
              solved ? "border-emerald-400 bg-emerald-100 text-emerald-700 ring-4 ring-emerald-300" : "border-dashed border-gray-300 text-gray-300"
            }`}
          >
            {solved ? equation.answer : "?"}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1">
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
              className={`relative inline-flex items-center justify-center p-0 text-2xl leading-none transition sm:text-3xl ${
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
                  className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-[120%] rounded-full bg-rose-500"
                  style={{ transform: "translate(-50%, -50%) rotate(-45deg)" }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {!solved ? (
        <div className="flex gap-3">
          {choices.map((value, index) => (
            <CarsAnswerSlot key={index} value={value} wrong={wrongIndex === index} onClick={() => handlePick(index, value)} />
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onSolved(departingIndices.map((i) => parkedCars[i]))}
          className="preschool-button z-10 flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-2.5 text-lg font-extrabold text-white shadow-lg ring-4 ring-emerald-300 transition hover:scale-105"
        >
          {t("departButton")} 🚗
        </button>
      )}
    </div>
  );
}

// --- Driving stage -------------------------------------------------------

// World coordinates (see lib/cars-game.ts's generateCarsRoute) are centered
// on (0,0) — a road with up to 5 turns has 6 straight 130px blocks, so a
// run that never turns can drift up to 780px from the start in a single
// direction. Shifting by this much before drawing keeps everything
// comfortably positive so a plain absolutely-positioned <svg> (no viewBox
// scaling trickery) can hold the whole route.
const WORLD_SHIFT = 900;
const WORLD_CANVAS_SIZE = 1800;

function toCanvasPoint(p: CarsPoint): CarsPoint {
  return { x: p.x + WORLD_SHIFT, y: p.y + WORLD_SHIFT };
}

function shiftWaypoints(waypoints: CarsPoint[]): CarsPoint[] {
  return waypoints.map(toCanvasPoint);
}

// Fraction of the viewport's own width/height where the car sits — near
// the bottom-left rather than dead-center, so the road has room to reveal
// itself ahead of (above/right of) the car as it drives.
const CAMERA_ANCHOR_X = 0.25;
const CAMERA_ANCHOR_Y = 0.8;

// The road is a strict grid (every segment is exactly axis-aligned — see
// lib/cars-game.ts's buildRoad), so the car only ever needs to face one of
// 4 cardinal headings. Car emoji (🚗🚕🚓...) render as a side-view sprite
// facing LEFT by default on most platforms, which is NOT rotationally
// symmetric: a plain 180°-rotation to face right would also flip the car
// upside-down (wheels on top), since rotating a side-view image by a half
// turn inverts its own up/down axis along with its left/right one — as
// reported from a live screenshot. Facing right is therefore a horizontal
// mirror (no rotation, wheels stay down); the other 3 directions are each
// only a quarter-turn from neutral, which just tilts the glyph rather than
// inverting it.
function carDirectionTransform(headingRad: number): string {
  const headingDeg = (((headingRad * 180) / Math.PI) % 360 + 360) % 360;
  if (headingDeg < 1 || headingDeg > 359) return "scaleX(-1)";
  return `rotate(${headingDeg - 180}deg)`;
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

function DirectionArrowIcon({ direction }: { direction: TurnDirection }) {
  const rotation = direction === "left" ? -90 : direction === "right" ? 90 : 0;
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 text-amber-600" style={{ transform: `rotate(${rotation}deg)` }} aria-hidden="true">
      <path d="M12 2 L20 12 L14 12 L14 22 L10 22 L10 12 L4 12 Z" fill="currentColor" />
    </svg>
  );
}

function CarsRoadSign({ direction, shakeToken }: { direction: TurnDirection; shakeToken: number }) {
  return (
    <div
      // Re-adding the exact same animation string wouldn't restart it — a
      // per-token no-op timing tweak, same idiom as cocktail-game.tsx's
      // CocktailGlass wobbleToken.
      data-shake={shakeToken}
      style={{ animation: shakeToken > 0 ? "raccoon-shake 0.4s ease-in-out" : undefined }}
      className="flex flex-col items-center gap-2 rounded-2xl bg-white/95 px-6 py-4 shadow-lg ring-4 ring-amber-300"
    >
      <DirectionArrowIcon direction={direction} />
    </div>
  );
}

function CarsDirectionPad({ onPick, disabled }: { onPick: (direction: TurnDirection) => void; disabled: boolean }) {
  const t = useTranslations("CarsGame");
  const buttonClass =
    "preschool-button flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl shadow-lg ring-4 ring-gray-200 transition hover:scale-105 disabled:cursor-default disabled:opacity-50 disabled:hover:scale-100";
  return (
    <div className="flex gap-3">
      <button type="button" aria-label={t("turnLeftLabel")} disabled={disabled} onClick={() => onPick("left")} className={buttonClass}>
        ⬅️
      </button>
      <button type="button" aria-label={t("driveStraightLabel")} disabled={disabled} onClick={() => onPick("straight")} className={buttonClass}>
        ⬆️
      </button>
      <button type="button" aria-label={t("turnRightLabel")} disabled={disabled} onClick={() => onPick("right")} className={buttonClass}>
        ➡️
      </button>
    </div>
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

type DrivePhase = "advancing" | "waiting" | "arrived";

function CarsDrivingStage({
  cars,
  route,
  muted,
  onDone,
}: {
  cars: string[];
  route: CarsRoute;
  muted: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("CarsGame");
  const [setViewportRef, viewportSize] = useViewportSize();
  const viewportReady = viewportSize.width > 0 && viewportSize.height > 0;
  const [journeyStarted, setJourneyStarted] = useState(false);
  const [turnIndex, setTurnIndex] = useState(0);
  const [phase, setPhase] = useState<DrivePhase>("advancing");
  const [shakeToken, setShakeToken] = useState(0);
  const celebrationRef = useRef<HTMLParagraphElement>(null);
  const rewardCarsGame = useRewardCarsGame();

  // Starts the drive from the parking-lot end of the route once the
  // viewport's real size is known (not on a fixed timer) — the very first
  // render or two happen before ResizeObserver's first measurement, when
  // viewportSize is still {0,0}; computing worldX/worldY against that would
  // park the camera in a corner instead of centered, and the *next* render
  // (once the real size arrives) would then wrongly CSS-transition away
  // from that bad position instead of just starting there cleanly.
  useEffect(() => {
    if (!viewportReady) return;
    const raf = requestAnimationFrame(() => setJourneyStarted(true));
    return () => cancelAnimationFrame(raf);
  }, [viewportReady]);

  const pendingTurn = turnIndex < route.turns.length ? route.turns[turnIndex] : null;
  const targetT = !journeyStarted ? 0 : pendingTurn ? pendingTurn.t : 1;
  const targetPoint = toCanvasPoint(pointAtT(route.waypoints, targetT));
  // Anchors the car near the bottom-left of the viewport (not centered) —
  // per this feature's own request, so the road (heading up/right from the
  // parking lot) has room to reveal itself ahead of the car as it drives,
  // the same corner it exits from throughout the whole journey rather than
  // only at the very start.
  const worldX = viewportSize.width * CAMERA_ANCHOR_X - targetPoint.x;
  const worldY = viewportSize.height * CAMERA_ANCHOR_Y - targetPoint.y;
  const headingRad = tangentAngleAtT(route.waypoints, targetT);

  useDiamondMilestoneReward({
    mode: "level",
    complete: phase === "arrived",
    rewardMutation: rewardCarsGame,
    originRef: celebrationRef,
  });

  // Speaks the current turn's instruction once whenever a fresh prompt
  // appears — not on every render, so a re-render from an unrelated state
  // change (e.g. the shake animation clearing) doesn't repeat it.
  useEffect(() => {
    if (phase === "waiting" && pendingTurn) sayUk(TURN_PHRASES[pendingTurn.direction], muted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turnIndex]);

  useEffect(() => {
    if (phase === "arrived") {
      playVictoryFanfare();
      sayUk(pickPhrase(ARRIVAL_PHRASES), muted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleWorldTransitionEnd = () => {
    if (phase !== "advancing") return;
    setPhase(pendingTurn ? "waiting" : "arrived");
  };

  const handleDirectionInput = (direction: TurnDirection) => {
    if (phase !== "waiting" || !pendingTurn) return;
    if (direction === pendingTurn.direction) {
      playCarHonkSound();
      setTurnIndex((i) => i + 1);
      setPhase("advancing");
    } else {
      playCocktailBounceSound();
      setShakeToken((n) => n + 1);
      setTimeout(() => sayUk(TURN_PHRASES[pendingTurn.direction], muted), 500);
    }
  };

  useEffect(() => {
    if (phase !== "waiting") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowLeft") handleDirectionInput("left");
      else if (event.key === "ArrowRight") handleDirectionInput("right");
      else if (event.key === "ArrowUp") handleDirectionInput("straight");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turnIndex]);

  return (
    <div className="relative flex w-full flex-1 flex-col items-center gap-4 py-2">
      <span className="z-10 text-sm font-bold text-emerald-800/70 sm:text-base">
        {t("destinationLabel")} {route.destination.emoji} {route.destination.label}
      </span>

      <div ref={setViewportRef} className="relative w-full flex-1 overflow-hidden rounded-2xl bg-gradient-to-b from-sky-200 to-emerald-200">
        {viewportReady && (
          <>
            <div
              className="absolute left-0 top-0"
              style={{ width: WORLD_CANVAS_SIZE, height: WORLD_CANVAS_SIZE, transform: `translate(${worldX}px, ${worldY}px)`, transition: "transform 900ms ease-in-out" }}
              onTransitionEnd={handleWorldTransitionEnd}
            >
              <svg width={WORLD_CANVAS_SIZE} height={WORLD_CANVAS_SIZE} className="absolute left-0 top-0" aria-hidden="true">
                <path d={waypointsToPathD(shiftWaypoints(route.waypoints))} stroke="#94a3b8" strokeWidth={22} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <path
                  d={waypointsToPathD(shiftWaypoints(route.waypoints))}
                  stroke="#f8fafc"
                  strokeWidth={14}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="14 14"
                />
              </svg>
              {(() => {
                const destinationPoint = toCanvasPoint(route.waypoints[route.waypoints.length - 1]);
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
                  a whole convoy. Sits inside the same translating world
                  wrapper as the road itself, so panning the camera
                  naturally carries it along. */}
              <span
                aria-hidden="true"
                className="absolute text-4xl transition-all duration-500 ease-in-out sm:text-5xl"
                style={{ left: targetPoint.x, top: targetPoint.y, transform: `translate(-50%, -50%) ${carDirectionTransform(headingRad)}` }}
              >
                {cars[0] ?? randomCarEmoji()}
              </span>
            </div>

            {phase === "waiting" && pendingTurn && (
              <div className="absolute inset-x-0 top-4 z-10 flex flex-col items-center gap-3">
                <CarsRoadSign direction={pendingTurn.direction} shakeToken={shakeToken} />
                <CarsDirectionPad onPick={handleDirectionInput} disabled={false} />
              </div>
            )}

            {phase === "arrived" && (
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
  const [departingCars, setDepartingCars] = useState<string[]>([]);

  if (roundPhase === "parking") {
    return (
      <CarsParkingStage
        equation={equation}
        muted={muted}
        onSolved={(cars) => {
          setDepartingCars(cars);
          setRoundPhase("driving");
        }}
      />
    );
  }
  return <CarsDrivingStage cars={departingCars} route={route} muted={muted} onDone={onWin} />;
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
