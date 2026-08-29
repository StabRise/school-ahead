"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { prefetchVoice, speak, warmupSpeech, type SpeechLanguage as GameLanguage } from "@/lib/piper-tts";
import { useBackgroundMusic } from "@/lib/use-background-music";
import { useBalloonPopGameStore, type BalloonMode } from "@/stores/balloon-pop-game-store";
import { useGameMusicStore } from "@/stores/game-music-store";

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
  icon?: string; // optional emoji shown above the label, larger than its text
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

// English greeting phrases for the "greetings" mode — no per-language
// variants exist yet, so the list is shown/spoken in English regardless of
// the selected game language.
const BALLOON_GREETINGS = [
  "Hello",
  "Hi",
  "Hey",
  "Good morning",
  "Good afternoon",
  "Good evening",
  "Bye",
  "Goodbye",
  "See you later",
];

// English animal names for the "animals" mode, paired with a representative
// emoji shown on the balloon — like "greetings", no per-language variants
// exist yet, so names are shown/spoken in English regardless of the
// selected game language. Unicode has no dedicated emoji for every animal
// here (e.g. cheetah/leopard, crocodile/alligator, walrus/seal, moose/deer/
// reindeer), so closely related species intentionally share a glyph, and a
// generic paw print stands in for the handful with no close match at all
// (platypus, armadillo, meerkat).
const BALLOON_ANIMALS: { name: string; emoji: string }[] = [
  { name: "Elephant", emoji: "🐘" },
  { name: "Lion", emoji: "🦁" },
  { name: "Tiger", emoji: "🐅" },
  { name: "Giraffe", emoji: "🦒" },
  { name: "Zebra", emoji: "🦓" },
  { name: "Hippopotamus", emoji: "🦛" },
  { name: "Rhinoceros", emoji: "🦏" },
  { name: "Cheetah", emoji: "🐆" },
  { name: "Leopard", emoji: "🐆" },
  { name: "Kangaroo", emoji: "🦘" },
  { name: "Koala", emoji: "🐨" },
  { name: "Panda", emoji: "🐼" },
  { name: "Gorilla", emoji: "🦍" },
  { name: "Chimpanzee", emoji: "🦧" },
  { name: "Wolf", emoji: "🐺" },
  { name: "Fox", emoji: "🦊" },
  { name: "Bear", emoji: "🐻" },
  { name: "Deer", emoji: "🦌" },
  { name: "Moose", emoji: "🫎" },
  { name: "Bison", emoji: "🦬" },
  { name: "Camel", emoji: "🐪" },
  { name: "Dolphin", emoji: "🐬" },
  { name: "Whale", emoji: "🐋" },
  { name: "Shark", emoji: "🦈" },
  { name: "Octopus", emoji: "🐙" },
  { name: "Eagle", emoji: "🦅" },
  { name: "Owl", emoji: "🦉" },
  { name: "Penguin", emoji: "🐧" },
  { name: "Flamingo", emoji: "🦩" },
  { name: "Parrot", emoji: "🦜" },
  { name: "Crocodile", emoji: "🐊" },
  { name: "Alligator", emoji: "🐊" },
  { name: "Turtle", emoji: "🐢" },
  { name: "Snake", emoji: "🐍" },
  { name: "Iguana", emoji: "🦎" },
  { name: "Frog", emoji: "🐸" },
  { name: "Salamander", emoji: "🦎" },
  { name: "Bat", emoji: "🦇" },
  { name: "Squirrel", emoji: "🐿️" },
  { name: "Hedgehog", emoji: "🦔" },
  { name: "Otter", emoji: "🦦" },
  { name: "Beaver", emoji: "🦫" },
  { name: "Raccoon", emoji: "🦝" },
  { name: "Platypus", emoji: "🐾" },
  { name: "Sloth", emoji: "🦥" },
  { name: "Armadillo", emoji: "🐾" },
  { name: "Meerkat", emoji: "🐾" },
  { name: "Walrus", emoji: "🦭" },
  { name: "Seal", emoji: "🦭" },
  { name: "Reindeer", emoji: "🦌" },
];

const BALLOON_MODES: BalloonMode[] = [
  "numbers10",
  "numbers20",
  "numbers100",
  "colors",
  "letters",
  "greetings",
  "animals",
];
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
): { label: string; icon?: string; color: string; speech: string } {
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
    case "greetings": {
      const label = randomFrom(BALLOON_GREETINGS);
      return { label, color: randomColor(), speech: label };
    }
    case "animals": {
      const animal = randomFrom(BALLOON_ANIMALS);
      return { label: animal.name, icon: animal.emoji, color: randomColor(), speech: animal.name };
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
    case "greetings":
      return BALLOON_GREETINGS;
    case "animals":
      // 50 names is as much background synthesis as numbers100's 100 — skip
      // proactive warmup and let pops cache lazily as each name comes up.
      return [];
    case "numbers10":
    default:
      return Array.from({ length: 10 }, (_, i) => String(i + 1));
  }
}

// Multi-word labels (the "greetings" mode's phrases) wrap onto a second
// line, balanced so neither line is much longer than the other, rather than
// shrinking to fit one long unbroken line.
function wrapBalloonLabel(label: string): string[] {
  const words = label.split(" ").filter(Boolean);
  if (words.length < 2) return [label];
  let bestSplit = 1;
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const line1 = words.slice(0, i).join(" ");
    const line2 = words.slice(i).join(" ");
    const score = Math.max(line1.length, line2.length);
    if (score < bestScore) {
      bestScore = score;
      bestSplit = i;
    }
  }
  return [words.slice(0, bestSplit).join(" "), words.slice(bestSplit).join(" ")];
}

// Longer labels (color names, three-digit numbers, wrapped phrase lines)
// need a smaller font to keep fitting inside the fixed balloon SVG viewBox.
// Sized off the longest *line* rather than the raw label, so wrapping a
// phrase into two lines lets it stay bigger than shrinking it as one string.
function labelFontSize(lines: string[]): number {
  const maxLineLength = Math.max(...lines.map((line) => line.length));
  if (maxLineLength <= 2) return 14;
  if (maxLineLength <= 4) return 12;
  if (maxLineLength <= 6) return 10;
  if (maxLineLength <= 8) return 8;
  if (maxLineLength <= 10) return 6.5;
  return 5.5;
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
  // A plain onClick only fires if the mouse/touch goes down and up on
  // (roughly) the same spot — a child pressing and dragging away before
  // release never triggers a click, so the balloon survives untouched.
  // Popping on pointerdown instead reacts the instant it's pressed,
  // independent of whatever the pointer does afterward. onClick stays as a
  // fallback for keyboard activation (Enter/Space), guarded so a completed
  // mouse click doesn't pop the same balloon twice.
  const poppedRef = useRef(false);
  const lines = wrapBalloonLabel(balloon.label);
  const fontSize = labelFontSize(lines);
  // The icon (e.g. "animals" mode) reads as the primary thing to recognize,
  // with its name as a caption — so it gets a fixed, larger size than the
  // name text, and the name shifts down to make room for it.
  const iconFontSize = 18;
  const textBaseY = balloon.icon ? 31 : 24;

  const handlePop = () => {
    if (poppedRef.current) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    poppedRef.current = true;
    onPop(balloon, rect);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    handlePop();
  };

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      onPointerDown={handlePointerDown}
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
        {balloon.icon && (
          <text
            x="20"
            y="14"
            textAnchor="middle"
            fontSize={iconFontSize}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {balloon.icon}
          </text>
        )}
        <text
          x="20"
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight="700"
          fill="white"
          // Otherwise a precise tap directly on the glyph can be grabbed by
          // the browser as a text-selection gesture instead of bubbling up
          // as a click on the button, so the balloon doesn't pop.
          style={{ paintOrder: "stroke", pointerEvents: "none", userSelect: "none" }}
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="0.5"
        >
          {lines.length === 2 ? (
            <>
              <tspan x="20" y={textBaseY - fontSize * 0.6}>
                {lines[0]}
              </tspan>
              <tspan x="20" y={textBaseY + fontSize * 0.6}>
                {lines[1]}
              </tspan>
            </>
          ) : (
            <tspan x="20" y={textBaseY}>
              {lines[0]}
            </tspan>
          )}
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
  const musicEnabled = useGameMusicStore((s) => s.musicEnabled);
  const setMusicEnabled = useGameMusicStore((s) => s.setMusicEnabled);
  const musicVolume = useGameMusicStore((s) => s.volume);
  const setMusicVolume = useGameMusicStore((s) => s.setVolume);
  const containerRef = useRef<HTMLDivElement>(null);

  useBackgroundMusic();

  useEffect(() => {
    const interval = setInterval(() => {
      setBalloons((current) => {
        if (current.length >= maxOnScreen) return current;
        const { label, icon, color, speech } = generateBalloonContent(mode, language);
        const balloon: FallingBalloon = {
          id: nextBalloonId++,
          left: randomBetween(4, 82),
          color,
          duration: randomBetween(6, 11) / speed,
          delay: 0,
          size: randomBetween(size * 0.75, size * 1.25),
          label,
          icon,
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

      <button
        type="button"
        aria-label={musicEnabled ? t("musicOnLabel") : t("musicOffLabel")}
        onClick={() => setMusicEnabled(!musicEnabled)}
        className="absolute left-16 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        {musicEnabled ? "🎵" : "🔇"}
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
