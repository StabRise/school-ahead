"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, useRewardBalloonPop, useRewardBalloonQuiz } from "@/lib/api/browser/auth/auth";
import { mapApiUserToAuthUser } from "@/lib/api/map-user";
import { prefetchVoice, speak, warmupSpeech, type SpeechLanguage as GameLanguage } from "@/lib/piper-tts";
import {
  playRecordedSound,
  usePreschoolFolders,
  useRecordedSounds,
  type PreschoolCard,
  type PreschoolFolderData,
} from "@/lib/preschool-sounds";
import { useBackgroundMusic } from "@/lib/use-background-music";
import { useAuthStore } from "@/stores/auth-store";
import { useBalloonPopGameStore, type BalloonMode } from "@/stores/balloon-pop-game-store";
import { useGameMusicStore } from "@/stores/game-music-store";
import { BalloonQuiz, buildBalloonQuizQuestions, type BalloonQuizQuestion } from "@/components/preschool/balloon-quiz";
import { BalloonLearningCards } from "@/components/preschool/balloon-learning-cards";

// Every DIAMOND_MILESTONE ruby balloons popped converts into 1 Diamond,
// awarded via POST /auth/me/balloon-pop-reward and animated flying to the
// header's DiamondBadge (components/header.tsx, marked with
// data-diamond-badge for this to find).
const DIAMOND_MILESTONE = 30;

// Celebration reward minigame — triggers when every one of today's lessons
// (tails included) is Completed, Pending Review, or Need Help (evaluated by
// the caller on dashboard load — see components/student-dashboard.tsx's
// READY_FOR_GAME_STATUSES check). See docs/views/preschool/README.md.

interface FallingBalloon {
  id: number;
  left: number; // percent across the play area
  color: string;
  duration: number; // seconds to fall
  delay: number; // seconds before starting
  size: number; // px
  label: string; // text printed on the balloon, depends on the selected mode
  icon?: string; // optional emoji hung below the balloon
  image?: string; // optional illustration hung below the balloon instead of `icon`
  speech: string; // text spoken via Piper TTS when the balloon is popped
  isQuizBalloon?: boolean; // heart-shaped "?" balloon — pops into the bonus quiz instead of scoring
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
  "Good morning",
  "Good afternoon",
  "Good evening",
  "Bye",
  "Goodbye",
  "See you later",
];

// Picture-pool modes ("animals", "schoolSupplies", "family", "bodyParts",
// "fruits") draw their cards from public/preschool/<folder> instead of a
// hardcoded name/image list — see usePreschoolFolders/PreschoolFolderData in
// lib/preschool-sounds.ts and /api/preschool-cards. A card's name is
// whatever an image file in that folder is named (minus extension); a name
// shared by two cards needs the image duplicated under both names (e.g.
// family's "Mother.jpeg" and "Mommy.jpeg"). The folder also optionally holds
// "en"/"uk"/"pl" subfolders — their presence marks that game language as
// supported for the mode (gating it in the mode picker, see
// isModeAvailableForLanguage below), and each one's title.json overrides the
// mode's display name for that language.
const PICTURE_POOL_BY_MODE: Partial<Record<BalloonMode, string>> = {
  animals: "animals",
  schoolSupplies: "school-supplies",
  family: "family",
  bodyParts: "body-parts",
  fruits: "fruits",
};

// Stable (module-level) list of every distinct folder above, for
// usePreschoolFolders's dependency array — the hook re-fetches whenever its
// `folders` argument's identity changes, so this must never be recreated.
const PICTURE_POOL_FOLDERS: string[] = Array.from(new Set(Object.values(PICTURE_POOL_BY_MODE)));

// A picture-pool mode with no language subfolders at all hasn't opted into
// per-language gating yet, so it stays available for every game language;
// one that has opted in only shows up for languages it actually has a
// subfolder for. Non-picture-pool modes (numbers/colors/letters/greetings)
// are never gated by this at all.
function isModeAvailableForLanguage(
  mode: BalloonMode,
  language: GameLanguage,
  folderData: Record<string, PreschoolFolderData>,
): boolean {
  const folder = PICTURE_POOL_BY_MODE[mode];
  if (!folder) return true;
  const availableLanguages = folderData[folder]?.availableLanguages ?? [];
  return availableLanguages.length === 0 || availableLanguages.includes(language);
}

const BALLOON_MODES: BalloonMode[] = [
  "numbers10",
  "numbers20",
  "numbers100",
  "colors",
  "letters",
  "greetings",
  "animals",
  "schoolSupplies",
  "family",
  "bodyParts",
  "fruits",
];
const GAME_LANGUAGES: GameLanguage[] = ["en", "uk", "pl"];

// Modes with a bonus heart-shaped "?" quiz balloon (balloon-quiz.tsx) —
// "numbers10" gets a counting quiz; "animals"/"schoolSupplies"/"family"/
// "bodyParts"/"fruits" each get a "where is the X?" picture quiz built from
// that mode's own image list (see PICTURE_POOL_BY_MODE above).
const QUIZ_BALLOON_MODES: BalloonMode[] = [
  "numbers10",
  "animals",
  "schoolSupplies",
  "family",
  "bodyParts",
  "fruits",
];
// Checked once per spawn tick (independently of the normal balloon spawned
// that same tick) while at most one quiz balloon is already on screen.
const QUIZ_BALLOON_SPAWN_CHANCE = 0.1;
const QUIZ_BALLOON_COLOR = "#f43f5e";

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
// How many random items a picture-pool mode's game/learning screens draw
// from (see selectedPictureItems below) — MIN_CARD_COUNT keeps the picture
// quiz's 4-choice questions (buildBalloonQuizQuestions) always solvable (a
// pool of 4 already gives a full target + 3 distractors, so 4 is the true
// floor, not just a margin above it).
const MIN_CARD_COUNT = 4;
const MAX_CARD_COUNT = 20;

let nextBalloonId = 0;
let nextParticleId = 0;
let nextRewardId = 0;

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

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Case-insensitive dedupe, keeping the first occurrence — a folder can end
// up with casing duplicates (e.g. "Panda.jpeg"/"panda.jpeg") that would
// otherwise count as two distinct items when sampling a fixed subset of a
// mode's pool.
function uniqueByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

// Picks the label (and, for "colors" mode, the color that must match it) for
// a newly spawned balloon. `speech` is what gets read aloud on pop — for
// "letters" that's just the capital letter, since speaking the "Aa" pair as
// one word wouldn't sound like the letter's name.
function generateBalloonContent(
  mode: BalloonMode,
  language: GameLanguage,
  // For picture-pool modes — the fixed subset selectedPictureItems picked
  // for this mode/cardCount (see BalloonPopGame), so balloons only ever show
  // the same items the "learning" card grid does. Undefined while that
  // mode's folder data hasn't loaded yet.
  picturePool?: PreschoolCard[],
): { label: string; icon?: string; image?: string; color: string; speech: string } {
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
    case "animals":
    case "schoolSupplies":
    case "family":
    case "bodyParts":
    case "fruits": {
      // The caller (the spawn effect in BalloonPopGame) never generates
      // content for one of these modes until its picturePool has actually
      // loaded, so `card` is only ever undefined in practice — the
      // empty-label fallback just keeps this type-safe without a
      // non-null assertion.
      const card = randomFrom(picturePool ?? []);
      if (!card) return { label: "", color: randomColor(), speech: "" };
      return { label: card.name, image: card.image, color: randomColor(), speech: card.name };
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
function vocabularyFor(mode: BalloonMode, language: GameLanguage, picturePool?: PreschoolCard[]): string[] {
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
    case "schoolSupplies":
    case "family":
    case "bodyParts":
    case "fruits":
      return (picturePool ?? []).map((card) => card.name);
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

// Celebratory rising arpeggio for the DIAMOND_MILESTONE reward — distinct
// from playPopSound's single blip so it reads as a bigger event.
function playDiamondChime() {
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((frequency, i) => {
      const startTime = ctx.currentTime + i * 0.09;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.4);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.42);
    });
    setTimeout(() => ctx.close(), (notes.length * 0.09 + 0.42) * 1000);
  } catch {
    // Best-effort only — never block the reward on audio failures.
  }
}

// Flies a 💎 from `from` (viewport coordinates, e.g. the score badge at the
// moment DIAMOND_MILESTONE is hit) to the header's DiamondBadge, then calls
// onDone so the caller can drop it from state. Portaled to document.body so
// its `fixed` positioning isn't affected by the game container's own
// `overflow-hidden`, and so it renders above the header it's flying into.
function FlyingDiamond({ from, onDone }: { from: { x: number; y: number }; onDone: () => void }) {
  // Measured once via a lazy initializer (runs synchronously during the
  // first render, before paint) rather than in an effect, so there's no
  // in-between frame where the target isn't known yet.
  const [target] = useState(() => {
    const badgeRect = document.querySelector("[data-diamond-badge]")?.getBoundingClientRect();
    return badgeRect
      ? { x: badgeRect.left + badgeRect.width / 2, y: badgeRect.top + badgeRect.height / 2 }
      : { x: window.innerWidth - 32, y: 32 };
  });
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setFlying(true));
    // Fallback in case onTransitionEnd never fires (e.g. reduced-motion
    // settings drop the transition) so the diamond can't get stuck forever.
    const fallback = setTimeout(onDone, 1200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = flying ? target : from;
  return createPortal(
    <span
      aria-hidden="true"
      onTransitionEnd={onDone}
      className="pointer-events-none fixed top-0 left-0 z-50 text-3xl"
      style={{
        transform: `translate(${point.x - 16}px, ${point.y - 16}px) scale(${flying ? 0.4 : 1.4})`,
        opacity: flying ? 0.15 : 1,
        transition: "transform 0.9s cubic-bezier(0.3, 0, 0.6, 1), opacity 0.9s ease-in",
      }}
    >
      💎
    </span>,
    document.body,
  );
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
  // The icon/image (e.g. "schoolSupplies"/"animals" modes) hangs below the
  // balloon on its string, like the character is dangling from it as it
  // falls — not printed inside the balloon itself, which stays the same
  // size regardless. A photo/illustration needs more room than an emoji
  // glyph, so it gets a taller viewBox and a bigger charm.
  const hasImage = Boolean(balloon.image);
  const hasIcon = Boolean(balloon.icon) || hasImage;
  const viewBoxHeight = hasImage ? 86 : hasIcon ? 74 : 52;
  const stringEndY = hasIcon ? 60 : 52;
  const imageRadius = 11;
  const imageCenterY = stringEndY + imageRadius + 1;

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
      <svg viewBox={`0 0 40 ${viewBoxHeight}`} className="w-full drop-shadow-md" aria-hidden="true">
        {balloon.isQuizBalloon ? (
          <path
            d="M20,40 C20,40 4,29.5 4,20.5 C4,15.25 8.25,11 13.5,11 C16.5,11 19,12.5 20,15 C21,12.5 23.5,11 26.5,11 C31.75,11 36,15.25 36,20.5 C36,29.5 20,40 20,40 Z"
            fill={balloon.color}
          />
        ) : (
          <>
            <ellipse cx="20" cy="20" rx="18" ry="20" fill={balloon.color} />
            <ellipse cx="14" cy="12" rx="4" ry="6" fill="white" opacity="0.35" />
          </>
        )}
        <text
          x="20"
          textAnchor="middle"
          fontSize={balloon.isQuizBalloon ? 20 : fontSize}
          fontWeight="700"
          fill="white"
          // Otherwise a precise tap directly on the glyph can be grabbed by
          // the browser as a text-selection gesture instead of bubbling up
          // as a click on the button, so the balloon doesn't pop.
          style={{ paintOrder: "stroke", pointerEvents: "none", userSelect: "none" }}
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="0.5"
        >
          {balloon.isQuizBalloon ? (
            // dominantBaseline="central" instead of the plain baseline the
            // other tspans use — at this fontSize a baseline-anchored glyph
            // sits well above the heart's visual center, not centered on it.
            <tspan x="20" y="25" dominantBaseline="central">
              ?
            </tspan>
          ) : lines.length === 2 ? (
            <>
              <tspan x="20" y={24 - fontSize * 0.6}>
                {lines[0]}
              </tspan>
              <tspan x="20" y={24 + fontSize * 0.6}>
                {lines[1]}
              </tspan>
            </>
          ) : (
            <tspan x="20" y="24">
              {lines[0]}
            </tspan>
          )}
        </text>
        <path d="M20 40 L17 46 L23 46 Z" fill={balloon.color} />
        <line x1="20" y1="46" x2="20" y2={stringEndY} stroke="#94a3b8" strokeWidth="1" />
        {hasImage ? (
          <>
            <clipPath id={`balloon-clip-${balloon.id}`}>
              <circle cx="20" cy={imageCenterY} r={imageRadius} />
            </clipPath>
            <circle cx="20" cy={imageCenterY} r={imageRadius + 1} fill="white" stroke="#94a3b8" strokeWidth="1" />
            <image
              href={balloon.image}
              x={20 - imageRadius}
              y={imageCenterY - imageRadius}
              width={imageRadius * 2}
              height={imageRadius * 2}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#balloon-clip-${balloon.id})`}
              style={{ pointerEvents: "none" }}
            />
          </>
        ) : (
          balloon.icon && (
            <text
              x="20"
              y={stringEndY + 10}
              textAnchor="middle"
              fontSize="16"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {balloon.icon}
            </text>
          )
        )}
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
  const [flyingDiamond, setFlyingDiamond] = useState<{ id: number; from: { x: number; y: number } } | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<BalloonQuizQuestion[] | null>(null);
  const awardedMilestonesRef = useRef<Set<number>>(new Set());
  const scoreBadgeRef = useRef<HTMLDivElement>(null);
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();
  const rewardBalloonPop = useRewardBalloonPop();
  const rewardBalloonQuiz = useRewardBalloonQuiz();
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
  const screenMode = useBalloonPopGameStore((s) => s.screenMode);
  const setScreenMode = useBalloonPopGameStore((s) => s.setScreenMode);
  const cardCount = useBalloonPopGameStore((s) => s.cardCount);
  const setCardCount = useBalloonPopGameStore((s) => s.setCardCount);
  const musicEnabled = useGameMusicStore((s) => s.musicEnabled);
  const setMusicEnabled = useGameMusicStore((s) => s.setMusicEnabled);
  const musicVolume = useGameMusicStore((s) => s.volume);
  const setMusicVolume = useGameMusicStore((s) => s.setVolume);
  const containerRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  // Closes the settings panel on a click/tap anywhere outside it — a child
  // poking around the screen while it's open shouldn't leave it stuck open
  // over the game. The toggle button is excluded so tapping it while open
  // just closes the panel once, instead of this handler closing it and the
  // button's own onClick immediately reopening it.
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

  // Card data for every picture-pool folder, fetched once up front (not
  // just the current mode's) — the mode picker below needs every folder's
  // availableLanguages to decide which modes to show for the selected
  // language, not only whichever mode happens to be selected right now.
  const folderData = usePreschoolFolders(PICTURE_POOL_FOLDERS);
  const picturePoolFolder = PICTURE_POOL_BY_MODE[mode];
  const isPictureMode = Boolean(picturePoolFolder);
  const picturePoolCards = picturePoolFolder ? folderData[picturePoolFolder]?.cards : undefined;
  // Recorded-pronunciation lookup keys off the picture-pool folder for
  // picture modes, or the mode's own name for everything else (e.g.
  // "greetings") — same "mode name = folder name" convention those modes'
  // asset folders already follow.
  const soundFolder = picturePoolFolder ?? mode;
  const { names: recordedSoundNames, soundsPath } = useRecordedSounds(soundFolder, language);

  const availableModes = useMemo(
    () => BALLOON_MODES.filter((m) => isModeAvailableForLanguage(m, language, folderData)),
    [language, folderData],
  );

  // A language switch can make the current mode unavailable (see
  // isModeAvailableForLanguage) — fall back to the first (always-available)
  // mode rather than leaving the game on a now-hidden one.
  useEffect(() => {
    if (!availableModes.includes(mode) && availableModes.length > 0) setMode(availableModes[0]);
  }, [availableModes, mode, setMode]);

  // A picture-pool mode's title.json for the current language (if any)
  // overrides its regular next-intl translation — lets a mode's display
  // name switch along with the selected game language once its folder has
  // per-language title overrides, without touching messages/*.json.
  const modeLabel = (m: BalloonMode): string => {
    const folder = PICTURE_POOL_BY_MODE[m];
    const override = folder ? folderData[folder]?.titles[language] : undefined;
    return override ?? t(`mode.${m}`);
  };

  // The fixed subset of `mode`'s picture pool that both the "game" (balloon)
  // and "learning" (flashcard) screens draw from — re-picked only when
  // `mode`, `cardCount`, or the underlying card data changes, so toggling
  // between the two screens never reshuffles it. `null` for modes with no
  // picture pool at all, or whose pool hasn't finished loading yet.
  const selectedPictureItems = useMemo(() => {
    if (!picturePoolCards || picturePoolCards.length === 0) return null;
    const unique = uniqueByName(picturePoolCards);
    return shuffle(unique).slice(0, Math.min(cardCount, unique.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cardCount, picturePoolCards]);

  // "Learning" only makes sense for picture-pool modes — falls back to
  // "game" if the mode changes to one without a card grid to show (e.g. the
  // settings panel's mode dropdown is switched away mid-session).
  useEffect(() => {
    if (!isPictureMode && screenMode === "learning") setScreenMode("game");
  }, [isPictureMode, screenMode, setScreenMode]);

  useBackgroundMusic();

  useEffect(() => {
    // Paused while the bonus quiz overlay is open, while showing the static
    // "learning" card grid instead of falling balloons, or (for a
    // picture-pool mode) while its folder data hasn't loaded yet.
    if (quizQuestions || screenMode === "learning") return;
    if (isPictureMode && !selectedPictureItems) return;
    const interval = setInterval(() => {
      setBalloons((current) => {
        if (current.length >= maxOnScreen) return current;

        const canSpawnQuizBalloon =
          QUIZ_BALLOON_MODES.includes(mode) &&
          !current.some((b) => b.isQuizBalloon) &&
          Math.random() < QUIZ_BALLOON_SPAWN_CHANCE;
        const content = canSpawnQuizBalloon
          ? { label: "?", color: QUIZ_BALLOON_COLOR, speech: "" }
          : generateBalloonContent(mode, language, selectedPictureItems ?? undefined);

        const balloon: FallingBalloon = {
          id: nextBalloonId++,
          left: randomBetween(4, 82),
          color: content.color,
          duration: randomBetween(6, 11) / speed,
          delay: 0,
          size: randomBetween(size * 0.75, size * 1.25),
          label: content.label,
          icon: "icon" in content ? content.icon : undefined,
          image: "image" in content ? content.image : undefined,
          speech: content.speech,
          isQuizBalloon: canSpawnQuizBalloon,
        };
        return [...current, balloon];
      });
    }, SPAWN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [size, speed, maxOnScreen, mode, language, quizQuestions, screenMode, isPictureMode, selectedPictureItems]);

  // Warms the voice model cache as soon as a language is selected, so the
  // first popped balloon doesn't stall on a multi-megabyte download — then
  // pre-synthesizes every value the selected mode can speak that isn't
  // already covered by a recorded pronunciation (see recordedSoundNames), so
  // pops play back instantly from cache instead of paying full TTS synthesis
  // latency (piper-tts rebuilds its inference session from scratch on every
  // call). Skipped entirely while muted, or once every value the mode can
  // speak turns out to have a recording of its own — no point downloading/
  // synthesizing voices nothing will play.
  useEffect(() => {
    const remainingVocabulary = vocabularyFor(mode, language, picturePoolCards).filter(
      (word) => !recordedSoundNames.has(word),
    );
    if (muted || remainingVocabulary.length === 0) return;
    let cancelled = false;
    void prefetchVoice(language, "short").then(() => {
      if (!cancelled) warmupSpeech(remainingVocabulary, language, "short");
    });
    return () => {
      cancelled = true;
    };
  }, [mode, language, muted, recordedSoundNames, picturePoolCards]);

  // Every DIAMOND_MILESTONE ruby balloons popped awards 1 Diamond — dedupes
  // via awardedMilestonesRef so React's dev-mode double-invoked effects (or
  // a re-render before the mutation settles) can't double-award the same
  // milestone.
  useEffect(() => {
    if (score === 0 || score % DIAMOND_MILESTONE !== 0) return;
    if (awardedMilestonesRef.current.has(score)) return;
    awardedMilestonesRef.current.add(score);

    playDiamondChime();
    const badgeRect = scoreBadgeRef.current?.getBoundingClientRect();
    const from = badgeRect
      ? { x: badgeRect.left + badgeRect.width / 2, y: badgeRect.top + badgeRect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    setFlyingDiamond({ id: nextRewardId++, from });

    rewardBalloonPop.mutate(undefined, {
      onSuccess: (response) => {
        setUser(mapApiUserToAuthUser(response.user));
        queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
      },
    });
    // rewardBalloonPop/setUser/queryClient are stable across renders; only
    // re-run when the score itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  const handleMissed = (balloonId: number) => {
    setBalloons((current) => current.filter((b) => b.id !== balloonId));
  };

  const handlePop = (balloon: FallingBalloon, rect: DOMRect) => {
    setBalloons((current) => current.filter((b) => b.id !== balloon.id));

    if (balloon.isQuizBalloon) {
      playPopSound();
      // Clears every other balloon too — a calm, empty screen behind the
      // quiz overlay instead of balloons drifting past its translucent scrim.
      setBalloons([]);
      setQuizQuestions(buildBalloonQuizQuestions(mode, selectedPictureItems ?? []));
      return;
    }

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
    if (!muted) {
      if (soundsPath && recordedSoundNames.has(balloon.speech)) {
        playRecordedSound(soundsPath, balloon.speech);
      } else {
        speak(balloon.speech, language, "short");
      }
    }
    setScore((current) => current + 1);
    setScoreBump((current) => current + 1);
  };

  const handleQuizFinish = (passed: boolean) => {
    setQuizQuestions(null);
    if (!passed) return;

    playDiamondChime();
    const badgeRect = scoreBadgeRef.current?.getBoundingClientRect();
    const from = badgeRect
      ? { x: badgeRect.left + badgeRect.width / 2, y: badgeRect.top + badgeRect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    setFlyingDiamond({ id: nextRewardId++, from });

    rewardBalloonQuiz.mutate(undefined, {
      onSuccess: (response) => {
        setUser(mapApiUserToAuthUser(response.user));
        queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
      },
    });
  };

  return (
    <div ref={containerRef} className="relative min-h-[32rem] flex-1 overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 pt-6 text-center">
      </div>

      <div
        ref={scoreBadgeRef}
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

      {flyingDiamond && (
        <FlyingDiamond
          key={flyingDiamond.id}
          from={flyingDiamond.from}
          onDone={() => setFlyingDiamond((current) => (current?.id === flyingDiamond.id ? null : current))}
        />
      )}

      <select
        aria-label={t("languageLabel")}
        value={language}
        onChange={(e) => setLanguage(e.target.value as GameLanguage)}
        // Fixed w-32 (rather than letting the native <select> auto-size)
        // so the pill doesn't render clipped to whatever width the browser
        // happens to compute for the currently-selected option — wide
        // enough for "Українська", the longest of the three labels.
        className="absolute left-4 top-4 z-10 h-9 w-32 truncate rounded-full bg-white pl-3 pr-1 text-sm font-bold text-gray-700 shadow-lg ring-2 ring-gray-200"
      >
        {GAME_LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {t(`language.${lang}`)}
          </option>
        ))}
      </select>

      <button
        ref={settingsButtonRef}
        type="button"
        aria-label={t("settingsButton")}
        onClick={() => setSettingsOpen((current) => !current)}
        className="absolute left-40 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        ⚙️
      </button>

      <button
        type="button"
        aria-label={musicEnabled ? t("musicOnLabel") : t("musicOffLabel")}
        onClick={() => setMusicEnabled(!musicEnabled)}
        className="absolute left-52 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        {musicEnabled ? "🎵" : "🔇"}
      </button>

      {settingsOpen && (
        <div
          ref={settingsPanelRef}
          className="absolute left-40 top-16 z-10 flex w-56 flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-lg ring-2 ring-gray-200"
        >
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("modeLabel")}</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as BalloonMode)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
            >
              {availableModes.map((m) => (
                <option key={m} value={m}>
                  {modeLabel(m)}
                </option>
              ))}
            </select>
          </label>
          {isPictureMode && (
            <label className="flex flex-col gap-1">
              <span className="font-medium text-gray-700">
                {t("cardCountLabel")} ({cardCount})
              </span>
              <input
                type="range"
                min={MIN_CARD_COUNT}
                max={MAX_CARD_COUNT}
                value={cardCount}
                onChange={(e) => setCardCount(Number(e.target.value))}
              />
            </label>
          )}
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

      {screenMode === "learning" && selectedPictureItems ? (
        <BalloonLearningCards
          items={selectedPictureItems}
          muted={muted}
          onPlay={(name) =>
            soundsPath && recordedSoundNames.has(name)
              ? playRecordedSound(soundsPath, name)
              : speak(name, language, "short")
          }
        />
      ) : (
        balloons.map((balloon) => (
          <BalloonNode
            key={balloon.id}
            balloon={balloon}
            label={balloon.isQuizBalloon ? t("heartBalloon") : t("balloon")}
            onPop={handlePop}
            onMissed={handleMissed}
          />
        ))
      )}

      {quizQuestions && (
        <BalloonQuiz questions={quizQuestions} language={language} muted={muted} onFinish={handleQuizFinish} />
      )}

      {isPictureMode && (
        <div className="absolute bottom-4 right-4 z-10 flex overflow-hidden rounded-full bg-white p-1 text-sm font-bold shadow-lg ring-2 ring-gray-200">
          <button
            type="button"
            onClick={() => setScreenMode("game")}
            className={`rounded-full px-3 py-1.5 transition-colors ${
              screenMode === "game" ? "bg-emerald-500 text-white" : "text-gray-600"
            }`}
          >
            {t("screenModeGame")}
          </button>
          <button
            type="button"
            onClick={() => {
              // Empties any falling balloons behind the card grid — same as
              // popping the bonus-quiz heart balloon does — rather than
              // leaving them to keep drifting/landing underneath it.
              setBalloons([]);
              setScreenMode("learning");
            }}
            className={`rounded-full px-3 py-1.5 transition-colors ${
              screenMode === "learning" ? "bg-emerald-500 text-white" : "text-gray-600"
            }`}
          >
            {t("screenModeLearning")}
          </button>
        </div>
      )}

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
