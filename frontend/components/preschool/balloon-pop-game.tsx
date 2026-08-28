"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { prefetchVoice, speak, warmupSpeech, type SpeechLanguage as GameLanguage } from "@/lib/piper-tts";
import { useBalloonPopGameStore, type BalloonMode } from "@/stores/balloon-pop-game-store";

// Celebration reward minigame — triggers when every one of today's lessons
// is Completed (evaluated by the caller on dashboard load). See
// docs/interfaces/preschool.md section 2.4.

interface FallingBalloon {
  id: number;
  left: number; // percent across the play area
  color: string;
  duration: number; // seconds to fall
  delay: number; // seconds before starting
  size: number; // px
  label: string; // text printed on the balloon, depends on the selected mode
  speech: string; // text spoken via Piper TTS when the balloon is popped
}

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  dx: number;
  dy: number;
}

// Hex values line up positionally with each language's name list below.
const BALLOON_COLOR_HEXES = ["#f87171", "#fb923c", "#fbbf24", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6"];

const COLOR_NAMES: Record<GameLanguage, string[]> = {
  en: ["Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Pink"],
  uk: ["Червоний", "Помаранчевий", "Жовтий", "Зелений", "Синій", "Фіолетовий", "Рожевий"],
  pl: ["Czerwony", "Pomarańczowy", "Żółty", "Zielony", "Niebieski", "Fioletowy", "Różowy"],
};

const ALPHABETS: Record<GameLanguage, string[]> = {
  en: [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
    "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T",
    "U", "V", "W", "X", "Y", "Z"
  ],
  uk: [
    "А", "Б", "В", "Г", "Ґ", "Д", "Е", "Є", "Ж", "З",
    "И", "І", "Ї", "Й", "К", "Л", "М", "Н", "О", "П",
    "Р", "С", "Т", "У", "Ф", "Х", "Ц", "Ч", "Ш", "Щ",
    "Ь", "Ю", "Я"
  ],
  pl: [
    "A", "Ą", "B", "C", "Ć", "D", "E", "Ę", "F", "G",
    "H", "I", "J", "K", "L", "Ł", "M", "N", "Ń", "O",
    "Ó", "P", "R", "S", "Ś", "T", "U", "W", "Y", "Z",
    "Ź", "Ż"
  ]
}

const BALLOON_MODES: BalloonMode[] = ["numbers10", "numbers20", "numbers100", "colors", "letters"];
const GAME_LANGUAGES: GameLanguage[] = ["en", "uk", "pl"];

const SPAWN_INTERVAL_MS = 850;
const PARTICLES_PER_POP = 10;

// Slider bounds — the sliders' persisted defaults (see balloon-pop-game-store)
// reproduce the original hardcoded values exactly: size randomBetween(84, 140)
// is base=112 ± 25%, duration randomBetween(6, 11) is speed=1 (i.e.
// unscaled), and 9 was the original MAX_ON_SCREEN.
const MIN_SIZE = 60;
const MAX_SIZE = 200;
const MIN_SPEED = 0.5;
const MAX_SPEED = 3;
const MIN_COUNT = 3;
const MAX_COUNT = 24;

let nextBalloonId = 0;
let nextParticleId = 0;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomColor(): string {
  return BALLOON_COLOR_HEXES[Math.floor(Math.random() * BALLOON_COLOR_HEXES.length)];
}

function randomNumber(max: number): number {
  return Math.floor(randomBetween(1, max + 1));
}

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// Picks the label (and, for "colors" mode, the color that must match it) for
// a newly spawned balloon. `speech` is what gets read aloud on pop — for
// "letters" that's just the capital letter, since speaking the "Aa" pair as
// one word wouldn't sound like the letter's name.
function generateBalloonContent(
  mode: BalloonMode,
  language: GameLanguage,
): { label: string; color: string; speech: string } {
  switch (mode) {
    case "numbers20": {
      const label = String(randomNumber(20));
      return { label, color: randomColor(), speech: label };
    }
    case "numbers100": {
      const label = String(randomNumber(100));
      return { label, color: randomColor(), speech: label };
    }
    case "colors": {
      const index = Math.floor(Math.random() * BALLOON_COLOR_HEXES.length);
      const label = COLOR_NAMES[language][index];
      return { label, color: BALLOON_COLOR_HEXES[index], speech: label };
    }
    case "letters": {
      const label = randomFrom(ALPHABETS[language]);
      return { label, color: randomColor(), speech: label.charAt(0) };
    }
    case "numbers10":
    default: {
      const label = String(randomNumber(10));
      return { label, color: randomColor(), speech: label };
    }
  }
}

// Every distinct value a mode can speak, for proactively warming the TTS
// cache (see the mode/language effect below) so pops play instantly instead
// of paying synthesis cost live. Skipped for numbers100 — 100 distinct
// utterances is too much background synthesis for a vocabulary that's
// mostly never hit in a single play session; those are cached lazily as
// they come up instead.
function vocabularyFor(mode: BalloonMode, language: GameLanguage): string[] {
  switch (mode) {
    case "numbers20":
      return Array.from({ length: 20 }, (_, i) => String(i + 1));
    case "numbers100":
      return [];
    case "colors":
      return COLOR_NAMES[language];
    case "letters":
      return ALPHABETS[language].map((letter) => letter.charAt(0));
    case "numbers10":
    default:
      return Array.from({ length: 10 }, (_, i) => String(i + 1));
  }
}

// Longer labels (color names, three-digit numbers) need a smaller font to
// keep fitting inside the fixed balloon SVG viewBox.
function labelFontSize(label: string): number {
  if (label.length <= 2) return 14;
  if (label.length <= 4) return 12;
  if (label.length <= 6) return 10;
  if (label.length <= 8) return 8;
  return 6.5;
}

// Synthesized "pop" — no audio asset pipeline exists in this project, and a
// short procedural blip keeps the minigame self-contained.
function playPopSound() {
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(700, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.2);
    oscillator.onended = () => ctx.close();
  } catch {
    // Best-effort only — never block the pop on audio failures (autoplay
    // restrictions, unsupported browser, ...).
  }
}

function RubyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9 drop-shadow" aria-hidden="true">
      <polygon points="12,1 23,9 12,23 1,9" fill="#e11d48" />
      <polygon points="1,9 12,9 12,1" fill="#fda4af" opacity="0.9" />
      <polygon points="12,1 23,9 12,9" fill="#fb7185" opacity="0.85" />
      <polygon points="1,9 12,9 12,23" fill="#be123c" opacity="0.85" />
      <polygon points="12,9 23,9 12,23" fill="#9f1239" opacity="0.85" />
    </svg>
  );
}

function BalloonNode({
  balloon,
  label,
  onPop,
  onMissed,
}: {
  balloon: FallingBalloon;
  label: string;
  onPop: (balloon: FallingBalloon, rect: DOMRect) => void;
  onMissed: (balloonId: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  const handlePop = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    onPop(balloon, rect);
  };

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      onClick={handlePop}
      className="absolute top-0 cursor-pointer touch-manipulation"
      style={{
        left: `${balloon.left}%`,
        width: balloon.size,
        animation: `balloon-fall ${balloon.duration}s linear ${balloon.delay}s forwards`,
      }}
      onAnimationEnd={() => onMissed(balloon.id)}
    >
      <svg viewBox="0 0 40 52" className="w-full drop-shadow-md" aria-hidden="true">
        <ellipse cx="20" cy="20" rx="18" ry="20" fill={balloon.color} />
        <ellipse cx="14" cy="12" rx="4" ry="6" fill="white" opacity="0.35" />
        <text
          x="20"
          y="24"
          textAnchor="middle"
          fontSize={labelFontSize(balloon.label)}
          fontWeight="700"
          fill="white"
          // Otherwise a precise tap directly on the glyph can be grabbed by
          // the browser as a text-selection gesture instead of bubbling up
          // as a click on the button, so the balloon doesn't pop.
          style={{ paintOrder: "stroke", pointerEvents: "none", userSelect: "none" }}
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="0.5"
        >
          {balloon.label}
        </text>
        <path d="M20 40 L17 46 L23 46 Z" fill={balloon.color} />
        <line x1="20" y1="46" x2="20" y2="52" stroke="#94a3b8" strokeWidth="1" />
      </svg>
    </button>
  );
}

export function BalloonPopGame() {
  const t = useTranslations("BalloonPopGame");
  const [balloons, setBalloons] = useState<FallingBalloon[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [score, setScore] = useState(0);
  const [scoreBump, setScoreBump] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const size = useBalloonPopGameStore((s) => s.size);
  const setSize = useBalloonPopGameStore((s) => s.setSize);
  const speed = useBalloonPopGameStore((s) => s.speed);
  const setSpeed = useBalloonPopGameStore((s) => s.setSpeed);
  const maxOnScreen = useBalloonPopGameStore((s) => s.maxOnScreen);
  const setMaxOnScreen = useBalloonPopGameStore((s) => s.setMaxOnScreen);
  const mode = useBalloonPopGameStore((s) => s.mode);
  const setMode = useBalloonPopGameStore((s) => s.setMode);
  const language = useBalloonPopGameStore((s) => s.language);
  const setLanguage = useBalloonPopGameStore((s) => s.setLanguage);
  const muted = useBalloonPopGameStore((s) => s.muted);
  const setMuted = useBalloonPopGameStore((s) => s.setMuted);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setBalloons((current) => {
        if (current.length >= maxOnScreen) return current;
        const { label, color, speech } = generateBalloonContent(mode, language);
        const balloon: FallingBalloon = {
          id: nextBalloonId++,
          left: randomBetween(4, 82),
          color,
          duration: randomBetween(6, 11) / speed,
          delay: 0,
          size: randomBetween(size * 0.75, size * 1.25),
          label,
          speech,
        };
        return [...current, balloon];
      });
    }, SPAWN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [size, speed, maxOnScreen, mode, language]);

  // Warms the voice model cache as soon as a language is selected, so the
  // first popped balloon doesn't stall on a multi-megabyte download — then
  // pre-synthesizes every value the selected mode can speak, so pops play
  // back instantly from cache instead of paying full TTS synthesis latency
  // (piper-tts rebuilds its inference session from scratch on every call).
  // Skipped entirely while muted — no point downloading/synthesizing voices
  // nothing will play.
  useEffect(() => {
    if (muted) return;
    let cancelled = false;
    void prefetchVoice(language, "short").then(() => {
      if (!cancelled) warmupSpeech(vocabularyFor(mode, language), language, "short");
    });
    return () => {
      cancelled = true;
    };
  }, [mode, language, muted]);

  const handleMissed = (balloonId: number) => {
    setBalloons((current) => current.filter((b) => b.id !== balloonId));
  };

  const handlePop = (balloon: FallingBalloon, rect: DOMRect) => {
    setBalloons((current) => current.filter((b) => b.id !== balloon.id));

    const containerRect = containerRef.current?.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - (containerRect?.left ?? 0);
    const y = rect.top + rect.height / 2 - (containerRect?.top ?? 0);

    const burst: Particle[] = Array.from({ length: PARTICLES_PER_POP }, () => {
      const angle = Math.random() * Math.PI * 2;
      const distance = randomBetween(24, 56);
      return {
        id: nextParticleId++,
        x,
        y,
        color: balloon.color,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
      };
    });
    setParticles((current) => [...current, ...burst]);
    setTimeout(() => {
      const burstIds = new Set(burst.map((p) => p.id));
      setParticles((current) => current.filter((p) => !burstIds.has(p.id)));
    }, 550);

    playPopSound();
    if (!muted) speak(balloon.speech, language, "short");
    setScore((current) => current + 1);
    setScoreBump((current) => current + 1);
  };

  return (
    <div ref={containerRef} className="relative min-h-[32rem] flex-1 overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 pt-6 text-center">
        <p className="text-xl font-bold text-gray-700">{t("title")}</p>
        <p className="text-sm text-gray-500">{t("subtitle")}</p>
      </div>

      <div
        key={scoreBump}
        role="status"
        aria-label={t("score", { count: score })}
        className="pointer-events-none absolute right-4 top-4 z-10 flex items-center gap-1 rounded-full bg-white px-3 py-2 shadow-lg ring-2 ring-rose-200"
        style={{ animation: scoreBump > 0 ? "score-pop 0.3s ease-out" : undefined }}
      >
        <RubyIcon />
        <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-rose-600 px-2 text-lg font-extrabold text-white">
          {score}
        </span>
      </div>

      <button
        type="button"
        aria-label={t("settingsButton")}
        onClick={() => setSettingsOpen((current) => !current)}
        className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        ⚙️
      </button>

      {settingsOpen && (
        <div className="absolute left-4 top-16 z-10 flex w-56 flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-lg ring-2 ring-gray-200">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("modeLabel")}</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as BalloonMode)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
            >
              {BALLOON_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`mode.${m}`)}
                </option>
              ))}
            </select>
          </label>
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
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            <span className="font-medium text-gray-700">{t("mutedLabel")}</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("sizeLabel")}</span>
            <input
              type="range"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("countLabel")}</span>
            <input
              type="range"
              min={MIN_COUNT}
              max={MAX_COUNT}
              value={maxOnScreen}
              onChange={(e) => setMaxOnScreen(Number(e.target.value))}
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

      {balloons.map((balloon) => (
        <BalloonNode key={balloon.id} balloon={balloon} label={t("balloon")} onPop={handlePop} onMissed={handleMissed} />
      ))}

      {particles.map((particle) => (
        <span
          key={particle.id}
          className="pointer-events-none absolute h-2 w-2 rounded-full"
          style={
            {
              left: particle.x,
              top: particle.y,
              backgroundColor: particle.color,
              animation: "particle-burst 0.5s ease-out forwards",
              "--dx": `${particle.dx}px`,
              "--dy": `${particle.dy}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
