"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRewardTrainsGame } from "@school-ahead/api-client/browser/auth/auth";
import { prefetchVoice, speak, type SpeechLanguage } from "@school-ahead/api-client";
import { useBackgroundMusic } from "./lib/use-background-music";
import { useTrainsGameStore, type KeyboardZone } from "./stores/trains-game-store";
import { useGameMusicStore } from "./stores/game-music-store";
import { useDiamondMilestoneReward } from "./kit/use-diamond-milestone-reward";
import { playChime, playTone } from "./kit/sound-effects";
import { MusicToggleButton } from "./kit/music-toggle-button";

// Celebration reward minigame, alternative to BalloonPopGame — same trigger
// (every one of today's lessons, tails included, is Completed, Pending
// Review, or Need Help) but themed around a train that arrives carrying a
// letter and waits for the matching physical keyboard key. See
// components/student-dashboard.tsx's READY_FOR_GAME_STATUSES check and
// docs/views/preschool/README.md ("Letter Train celebration").

type TrainPhase = "arriving" | "waiting" | "departing";

// No Polish here (unlike the balloon game, which still offers all three) —
// this game is keyboard-position-driven (see KEYBOARD_ZONES below), and
// only en/uk have a confidently-known physical layout in this codebase.
type GameLanguage = Exclude<SpeechLanguage, "pl">;

// Uppercase only — the game asks for a physical keypress, matched
// case-insensitively against KeyboardEvent.key, not a letter pair like the
// balloon game's alphabet mode.
const LETTERS: Record<GameLanguage, string[]> = {
  en: [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  ],
  uk: [
    "А", "Б", "В", "Г", "Ґ", "Д", "Е", "Є", "Ж", "З", "И", "І", "Ї",
    "Й", "К", "Л", "М", "Н", "О", "П", "Р", "С", "Т", "У", "Ф", "Х",
    "Ц", "Ч", "Ш", "Щ", "Ь", "Ю", "Я",
  ],
};

// Which letters live in the left/center/right third of each physical
// keyboard row — lets the settings panel narrow the pool to "letters my
// left/right hand reaches" instead of the whole alphabet. Built from the
// standard row layout (US QWERTY for en; ЙЦУКЕН, which uses the same
// physical rows, for uk), each row split into three roughly-even chunks.
// uk's Ґ has no dedicated slot in that 3-row block on a standard layout
// (it rides on a punctuation key instead) — approximated into "left" here
// rather than left out of every zone.
const KEYBOARD_ZONES: Record<GameLanguage, Record<Exclude<KeyboardZone, "all">, string[]>> = {
  en: {
    left: ["Q", "W", "E", "R", "A", "S", "D", "Z", "X"],
    center: ["T", "Y", "U", "F", "G", "H", "C", "V", "B"],
    right: ["I", "O", "P", "J", "K", "L", "N", "M"],
  },
  uk: {
    left: ["Й", "Ц", "У", "К", "Ф", "І", "В", "А", "Я", "Ч", "С", "Ґ"],
    center: ["Е", "Н", "Г", "Ш", "П", "Р", "О", "Л", "М", "И", "Т"],
    right: ["Щ", "З", "Х", "Ї", "Д", "Ж", "Є", "Ь", "Б", "Ю"],
  },
};

function lettersForZone(language: GameLanguage, zone: KeyboardZone): string[] {
  return zone === "all" ? LETTERS[language] : KEYBOARD_ZONES[language][zone];
}

const WAGON_COLOR_HEXES = ["#f87171", "#fb923c", "#fbbf24", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6"];

const GAME_LANGUAGES: GameLanguage[] = ["en", "uk"];
const DEFAULT_LANGUAGE: GameLanguage = "en";
const KEYBOARD_ZONE_OPTIONS: KeyboardZone[] = ["all", "left", "center", "right"];

const ARRIVE_DURATION_S = 2.2;
const DEPART_DURATION_S = 1.8;
const CHUG_INTERVAL_MS = 260;

const MIN_SPEED = 0.5;
const MAX_SPEED = 3;

// Every MILESTONE_LETTERS collected letters converts into 1 Diamond,
// awarded via POST /auth/me/trains-game-reward and animated flying to the
// header's DiamondBadge (components/header.tsx) — see
// stores/diamond-reward-store.ts and components/flying-diamond.tsx, same
// mechanism as reading-game.tsx's/balloon-pop-game.tsx's own milestones.
const DIAMOND_MILESTONE_LETTERS = 10;

function randomColor(): string {
  return WAGON_COLOR_HEXES[Math.floor(Math.random() * WAGON_COLOR_HEXES.length)];
}

// Avoids handing out the same letter twice in a row. `pool` is already
// resolved to the current language + keyboard zone — see lettersForZone.
function pickNextLetter(pool: string[], exclude?: string): string {
  if (pool.length <= 1) return pool[0];
  let letter = pool[Math.floor(Math.random() * pool.length)];
  while (letter === exclude) {
    letter = pool[Math.floor(Math.random() * pool.length)];
  }
  return letter;
}

// Short percussive "chuff" — a synthesized low thump standing in for a steam
// train's chug, repeated on an interval while the train is moving (see the
// chug effect in TrainsGame). Reuses one AudioContext across chuffs (unlike
// the "correct key" chime, a one-off) since this fires several times a
// second — see sound-effects.ts's playTone `ctx` option.
function playChug(ctx: AudioContext) {
  playTone(120, { ctx, type: "square", duration: 0.11, gain: 0.18, glideTo: 60 });
}

interface FlyingLetterState {
  id: number;
  letter: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

let nextFlyingLetterId = 0;

// Flies the just-collected letter from the stopped train to the "collected"
// panel (top-right, see TrainsGame's collectedPanelRef) — positive feedback
// for the correct keypress beyond the chime, and a visual cue for exactly
// where the count went up. `from`/`to` are already relative to the game's
// own container (see the handleKeyDown handler that builds them), so this
// renders as a plain absolutely-positioned span rather than a
// document.body portal like components/flying-diamond.tsx uses — this
// game has no cross-page target to reach.
function FlyingLetter({ letter, from, to, onDone }: { letter: string; from: { x: number; y: number }; to: { x: number; y: number }; onDone: () => void }) {
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setFlying(true));
    // Fallback in case onTransitionEnd never fires (e.g. reduced-motion
    // settings drop the transition) so the letter can't get stuck forever.
    const fallback = setTimeout(onDone, 900);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = flying ? to : from;
  return (
    <span
      aria-hidden="true"
      onTransitionEnd={onDone}
      className="pointer-events-none absolute left-0 top-0 z-20 text-4xl font-extrabold text-sky-700"
      style={{
        transform: `translate(${point.x - 18}px, ${point.y - 18}px) scale(${flying ? 0.35 : 1.3})`,
        opacity: flying ? 0.15 : 1,
        transition: "transform 0.7s cubic-bezier(0.3, 0, 0.6, 1), opacity 0.7s ease-in",
      }}
    >
      {letter}
    </span>
  );
}

function TrainNode({ letter, color }: { letter: string; color: string }) {
  // The whole node travels left-to-right (see train-arrive/train-depart in
  // globals.css), so its leading edge is the right side — the locomotive
  // sits there, pulling the letter wagon behind it on the left, coupled by
  // the small connector rect in between.
  return (
    <svg viewBox="0 0 220 110" className="w-64 drop-shadow-lg sm:w-80" aria-hidden="true">
      <circle cx="44" cy="92" r="12" fill="#334155" />
      <circle cx="84" cy="92" r="12" fill="#334155" />
      <circle cx="150" cy="92" r="12" fill="#334155" />
      <circle cx="190" cy="92" r="12" fill="#334155" />
      <rect x="6" y="30" width="96" height="56" rx="10" fill={color} />
      <rect x="102" y="58" width="14" height="6" fill="#475569" />
      <rect x="126" y="34" width="90" height="52" rx="10" fill="#ef4444" />
      <rect x="134" y="14" width="26" height="26" rx="4" fill="#ef4444" />
      <rect x="136" y="18" width="20" height="14" fill="#bae6fd" opacity="0.9" />
      <rect x="168" y="6" width="14" height="28" rx="3" fill="#7f1d1d" />
      <circle cx="206" cy="50" r="8" fill="#fde68a" />
      <text
        x="54"
        y="68"
        textAnchor="middle"
        fontSize="34"
        fontWeight="800"
        fill="white"
        // Otherwise a precise tap/click can be grabbed as a text-selection
        // gesture instead of the intended interaction.
        style={{ paintOrder: "stroke", pointerEvents: "none", userSelect: "none" }}
        stroke="rgba(0,0,0,0.25)"
        strokeWidth="1"
      >
        {letter}
      </text>
    </svg>
  );
}

export function TrainsGame() {
  const t = useTranslations("TrainsGame");
  const [language, setLanguage] = useState<GameLanguage>(DEFAULT_LANGUAGE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trainKey, setTrainKey] = useState(0);
  const [phase, setPhase] = useState<TrainPhase>("arriving");
  const [currentLetter, setCurrentLetter] = useState<string | null>(null);
  const [wagonColor, setWagonColor] = useState<string>(WAGON_COLOR_HEXES[0]);
  const [collected, setCollected] = useState<string[]>([]);
  const [collectedBump, setCollectedBump] = useState(0);
  const [flyingLetters, setFlyingLetters] = useState<FlyingLetterState[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const trainRef = useRef<HTMLDivElement>(null);
  const collectedPanelRef = useRef<HTMLDivElement>(null);
  const speed = useTrainsGameStore((s) => s.speed);
  const setSpeed = useTrainsGameStore((s) => s.setSpeed);
  const zone = useTrainsGameStore((s) => s.zone);
  const setZone = useTrainsGameStore((s) => s.setZone);
  const musicVolume = useGameMusicStore((s) => s.volume);
  const setMusicVolume = useGameMusicStore((s) => s.setVolume);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rewardTrainsGame = useRewardTrainsGame();

  useBackgroundMusic();

  // Every DIAMOND_MILESTONE_LETTERS collected letters awards 1 Diamond for a
  // signed-in student — an anonymous visitor still sees the collected count
  // go up, they just don't earn anything (see useDiamondMilestoneReward).
  useDiamondMilestoneReward({
    mode: "count",
    count: collected.length,
    threshold: DIAMOND_MILESTONE_LETTERS,
    rewardMutation: rewardTrainsGame,
    originRef: collectedPanelRef,
  });

  // Picks the very first letter client-side only, after mount — doing this
  // in a useState initializer would run during server render too and mismatch
  // against the client's random pick (both the random letter itself and the
  // persisted zone, which isn't known during server render). Deferred a
  // tick (rather than set directly in the effect body) to avoid cascading
  // renders.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setCurrentLetter(pickNextLetter(lettersForZone(DEFAULT_LANGUAGE, zone)));
      setWagonColor(randomColor());
    }, 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warms the voice model cache as soon as a language is selected, so the
  // first arriving train doesn't stall its speech on a multi-megabyte download.
  useEffect(() => {
    void prefetchVoice(language, "short");
  }, [language]);

  useEffect(() => {
    if (phase !== "arriving" || !currentLetter) return;
    const timeout = setTimeout(() => {
      speak(currentLetter, language, "short");
    }, 800); // Delay interval
    return () => clearTimeout(timeout);
  }, [phase, currentLetter, language]);

  // Accepted as soon as the train is on screen and readable — arriving as
  // well as stopped-and-waiting — not only once it comes to a stop.
  useEffect(() => {
    if (phase === "departing" || !currentLetter) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length !== 1) return;
      if (event.key.toUpperCase() !== currentLetter.toUpperCase()) return;
      playChime([523.25, 783.99], { noteGap: 0.12, noteDuration: 0.25, gain: 0.25 });
      const containerRect = containerRef.current?.getBoundingClientRect();
      const trainRect = trainRef.current?.getBoundingClientRect();
      const panelRect = collectedPanelRef.current?.getBoundingClientRect();
      if (containerRect && trainRect && panelRect) {
        setFlyingLetters((current) => [
          ...current,
          {
            id: nextFlyingLetterId++,
            letter: currentLetter,
            from: {
              x: trainRect.left + trainRect.width / 2 - containerRect.left,
              y: trainRect.top + trainRect.height / 2 - containerRect.top,
            },
            to: {
              x: panelRect.left + panelRect.width / 2 - containerRect.left,
              y: panelRect.top + 24 - containerRect.top,
            },
          },
        ]);
      }
      setCollected((current) => [...current, currentLetter]);
      setCollectedBump((current) => current + 1);
      setPhase("departing");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, currentLetter]);

  // Chugging sound while the train is actually moving (arriving or
  // departing), silent while it's stopped and waiting for the key. One
  // AudioContext is reused across chuffs and torn down on unmount.
  useEffect(() => {
    if (phase === "waiting") return;
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new AudioContextClass();
      } catch {
        return;
      }
    }
    const ctx = audioCtxRef.current;
    playChug(ctx);
    const interval = setInterval(() => playChug(ctx), CHUG_INTERVAL_MS / speed);
    return () => clearInterval(interval);
  }, [phase, speed]);

  useEffect(() => {
    return () => {
      void audioCtxRef.current?.close();
    };
  }, []);

  const handleAnimationEnd = () => {
    if (phase === "arriving") {
      setPhase("waiting");
    } else if (phase === "departing") {
      setCurrentLetter((previous) => pickNextLetter(lettersForZone(language, zone), previous ?? undefined));
      setWagonColor(randomColor());
      setTrainKey((key) => key + 1);
      setPhase("arriving");
    }
  };

  const animation =
    phase === "arriving"
      ? `train-arrive ${ARRIVE_DURATION_S / speed}s ease-out forwards`
      : phase === "departing"
        ? `train-depart ${DEPART_DURATION_S / speed}s ease-in forwards`
        : undefined;

  return (
    <div ref={containerRef} className="relative min-h-[32rem] flex-1 overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 pt-6 text-center">
        <p className="text-xl font-bold text-gray-700">{t("title")}</p>
        <p className="text-sm text-gray-500">
          {phase !== "departing" && currentLetter ? t("instruction", { letter: currentLetter }) : t("subtitle")}
        </p>
      </div>

      <div
        ref={collectedPanelRef}
        role="status"
        aria-label={t("collected", { count: collected.length })}
        className="absolute right-4 top-4 z-10 flex max-h-[70%] w-40 flex-col gap-2 rounded-2xl bg-white p-3 text-sm shadow-lg ring-2 ring-sky-200"
      >
        <div className="flex items-center justify-between">
          <span className="font-medium text-gray-700">{t("collectedLabel")}</span>
          <span
            key={collectedBump}
            className="flex h-7 min-w-7 items-center justify-center rounded-full bg-sky-600 px-2 text-sm font-extrabold text-white"
            style={{ animation: collectedBump > 0 ? "score-pop 0.3s ease-out" : undefined }}
          >
            {collected.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-1 overflow-y-auto">
          {collected.map((letter, index) => (
            <span
              key={index}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sm font-bold text-sky-800"
            >
              {letter}
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        aria-label={t("settingsButton")}
        onClick={() => setSettingsOpen((current) => !current)}
        className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        ⚙️
      </button>

      <MusicToggleButton className="absolute left-16 top-4 z-10" />

      {settingsOpen && (
        <div className="absolute left-4 top-16 z-10 flex w-56 flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-lg ring-2 ring-gray-200">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("languageLabel")}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as GameLanguage)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
            >
              {GAME_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {t(`language.${lang}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("zoneLabel")}</span>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value as KeyboardZone)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
            >
              {KEYBOARD_ZONE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`zone.${option}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("musicVolumeLabel")}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={musicVolume}
              onChange={(e) => setMusicVolume(Number(e.target.value))}
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
        </div>
      )}

      <div className="absolute inset-x-0 bottom-16 z-0 h-2 bg-gray-400/40" />

      {currentLetter && (
        <div
          ref={trainRef}
          key={trainKey}
          className="absolute bottom-24"
          style={{ left: phase === "arriving" ? "-40%" : "50%", transform: "translateX(-50%)", animation }}
          onAnimationEnd={handleAnimationEnd}
        >
          <TrainNode letter={currentLetter} color={wagonColor} />
        </div>
      )}

      {flyingLetters.map((fl) => (
        <FlyingLetter
          key={fl.id}
          letter={fl.letter}
          from={fl.from}
          to={fl.to}
          onDone={() => setFlyingLetters((current) => current.filter((f) => f.id !== fl.id))}
        />
      ))}
    </div>
  );
}
