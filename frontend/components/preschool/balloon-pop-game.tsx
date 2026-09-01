"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, useRewardBalloonPop, useRewardBalloonQuiz } from "@/lib/api/browser/auth/auth";
import { mapApiUserToAuthUser } from "@/lib/api/map-user";
import { prefetchVoice, speak, warmupSpeech, type SpeechLanguage as GameLanguage } from "@/lib/piper-tts";
import {
  EMPTY_MODE_DATA,
  playRecordedSound,
  resolveCardName,
  usePreschoolModeData,
  usePreschoolModes,
  type PreschoolCard,
  type PreschoolModeData,
} from "@/lib/preschool-sounds";
import { useBackgroundMusic } from "@/lib/use-background-music";
import { useAuthStore } from "@/stores/auth-store";
import { useBalloonPopGameStore, type BalloonMode } from "@/stores/balloon-pop-game-store";
import { useDiamondRewardStore } from "@/stores/diamond-reward-store";
import { useGameMusicStore } from "@/stores/game-music-store";
import { BalloonQuiz, buildBalloonQuizQuestions, type BalloonQuizQuestion } from "@/components/preschool/balloon-quiz";
import { BalloonLearningCards, type LearningCard } from "@/components/preschool/balloon-learning-cards";

// Every DIAMOND_MILESTONE ruby balloons popped converts into 1 Diamond,
// awarded via POST /auth/me/balloon-pop-reward and animated flying to the
// header's DiamondBadge (components/header.tsx, marked with
// data-diamond-badge for this to find) — see stores/diamond-reward-store.ts
// and components/flying-diamond.tsx.
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
  label: string; // text printed on the balloon (the card's display name)
  image?: string; // optional illustration hung below the balloon
  // Overrides the label's default white fill — only set for "colors" mode,
  // whose balloon fill is the literal named color (see labelTextColorFor).
  textColor?: string;
  // Canonical card name — matches PreschoolCard.key, used to look up a
  // recorded pronunciation on pop (see handlePop). Not necessarily what's
  // shown/spoken — that's `speech`.
  cardKey: string;
  speech: string; // display text spoken via TTS when no recording covers cardKey
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

const GAME_LANGUAGES: GameLanguage[] = ["en", "uk", "pl"];

// Every mode gets the bonus heart-balloon quiz by default, phrased as
// "Where is {card}?" — a mode overrides this per language via its
// title.json's "quiz.question_format" (see quizQuestionFormat below and
// numbers-0-10's title.json for an example: "Where is the number {card}?").
const DEFAULT_QUESTION_FORMAT: Record<GameLanguage, string> = {
  en: "Where is {card}?",
  uk: "Де {card}?",
  pl: "Gdzie jest {card}?",
};

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
// How many random cards a mode's pool (see displayCards below) the "game"
// (balloons) and "learning" (flashcards) screens both draw from —
// MIN_CARD_COUNT keeps the bonus quiz's 4-choice questions
// (buildBalloonQuizQuestions) always solvable (a pool of 4 already gives a
// full target + 3 distractors, so 4 is the true floor, not just a margin
// above it).
const MIN_CARD_COUNT = 4;
const MAX_CARD_COUNT = 20;

let nextBalloonId = 0;
let nextParticleId = 0;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomColor(): string {
  return BALLOON_COLOR_HEXES[Math.floor(Math.random() * BALLOON_COLOR_HEXES.length)];
}

// Legible label-text color for a "colors"-mode balloon, whose fill is the
// literal CSS color it names (see generateBalloonContent) rather than a
// palette hex hand-picked for contrast with white text — "White"/"Yellow"/
// "Beige" etc. would otherwise render illegible white-on-white/near-white
// text. Renders the color into a throwaway 1x1 canvas to read back its
// actual RGB (so it works for any valid CSS color keyword the colors/
// folder might name an image after, not a hardcoded list of "light"
// colors) and picks by standard relative luminance. Cached per color since
// the same handful of names repeat across every spawned balloon.
const labelTextColorCache = new Map<string, string>();

function labelTextColorFor(cssColor: string): string {
  const cached = labelTextColorCache.get(cssColor);
  if (cached) return cached;
  let result = "white";
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = cssColor;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      result = luminance > 0.6 ? "#1f2937" : "white";
    }
  } catch {
    // Best-effort only — falls back to white.
  }
  labelTextColorCache.set(cssColor, result);
  return result;
}

// Fallback display name for a mode with no title.json at all in any
// language — "school-supplies" -> "School Supplies", "numbers-0-10" ->
// "Numbers 0 10". Not perfect for every folder name, but a mode is expected
// to ship a title.json for a properly-cased/punctuated name; this only
// covers a freshly-dropped folder that hasn't gotten one yet.
function prettifyModeName(folder: string): string {
  return folder
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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

// Case-insensitive dedupe by key, keeping the first occurrence — a folder
// can end up with casing duplicates (e.g. "Panda.jpeg"/"panda.jpeg") that
// would otherwise count as two distinct items when sampling a fixed subset
// of a mode's pool.
function uniqueByKey(cards: PreschoolCard[]): PreschoolCard[] {
  const seen = new Set<string>();
  const result: PreschoolCard[] = [];
  for (const card of cards) {
    const key = card.key.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(card);
  }
  return result;
}

// A mode is "available" for a language if it hasn't opted into per-language
// content at all (no "en"/"uk"/"pl" subfolders — treated as available
// everywhere), or if it has a subfolder for this specific language.
function isModeAvailableForLanguage(modeData: PreschoolModeData | undefined, language: GameLanguage): boolean {
  const availableLanguages = modeData?.availableLanguages ?? [];
  return availableLanguages.length === 0 || availableLanguages.includes(language);
}

// Picks the label/image/color for a newly spawned balloon from `cards` (the
// mode's current displayCards — already resolved to this language's
// display names, see BalloonPopGame). `speech` is what gets read aloud on
// pop when no recording covers `cardKey`.
function generateBalloonContent(
  mode: BalloonMode,
  cards: LearningCard[],
): { label: string; image?: string; color: string; textColor?: string; cardKey: string; speech: string } {
  const card = randomFrom(cards);
  if (!card) return { label: "", color: randomColor(), cardKey: "", speech: "" };
  if (mode === "colors") {
    // Every image in public/static/balloon-game/colors is named after a
    // CSS color keyword (e.g. "Red.jpeg", "Beige.jpeg") — the balloon is
    // filled with that literal color (via its canonical, untranslated key,
    // since a translated name like "Червоний" isn't a valid CSS value)
    // rather than a random palette hex, so it visually IS the color a
    // child is learning, with the photo hanging below (a red apple, say)
    // as a real-world anchor for it.
    const cssColor = card.key.toLowerCase();
    return {
      label: card.name,
      image: card.image,
      color: cssColor,
      textColor: labelTextColorFor(cssColor),
      cardKey: card.key,
      speech: card.name,
    };
  }
  return { label: card.name, image: card.image, color: randomColor(), cardKey: card.key, speech: card.name };
}

// Multi-word labels (e.g. Polish "Klej w sztyfcie" for "Glue stick") wrap
// onto a second line, balanced so neither line is much longer than the
// other, rather than shrinking to fit one long unbroken line.
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
  // The image (most modes) hangs below the balloon on its string, like the
  // character is dangling from it as it falls — not printed inside the
  // balloon itself, which stays the same size regardless. A mode with no
  // images at all (e.g. every number mode) just prints the label with no
  // charm below.
  const hasImage = Boolean(balloon.image);
  const viewBoxHeight = hasImage ? 86 : 52;
  const stringEndY = hasImage ? 60 : 52;
  const imageRadius = 11;
  // Only "colors" mode ever sets textColor (see labelTextColorFor) — every
  // other mode keeps the original white-on-dark-stroke look untouched.
  const labelColor = balloon.textColor ?? "white";
  const labelStroke = balloon.textColor ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.2)";
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
          fill={labelColor}
          // Otherwise a precise tap directly on the glyph can be grabbed by
          // the browser as a text-selection gesture instead of bubbling up
          // as a click on the button, so the balloon doesn't pop.
          style={{ paintOrder: "stroke", pointerEvents: "none", userSelect: "none" }}
          stroke={labelStroke}
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
        {hasImage && (
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
  const [quizQuestions, setQuizQuestions] = useState<BalloonQuizQuestion[] | null>(null);
  const awardedMilestonesRef = useRef<Set<number>>(new Set());
  const scoreBadgeRef = useRef<HTMLDivElement>(null);
  const setUser = useAuthStore((s) => s.setUser);
  const addDiamondFlight = useDiamondRewardStore((s) => s.addFlight);
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

  // The full mode list — every subfolder of public/static/balloon-game
  // (see /api/preschool-modes) — and each one's full data (cards, titles,
  // quiz phrasing, translations, sound coverage for every language at
  // once, see /api/preschool-mode), fetched once up front rather than just
  // the current mode's, since the mode picker below needs every mode's
  // availableLanguages/title for the current language regardless of
  // whichever mode happens to be selected right now.
  const modes = usePreschoolModes();
  const modeData = usePreschoolModeData(modes);
  const currentModeData = modeData[mode] ?? EMPTY_MODE_DATA;

  const availableModes = useMemo(
    () => modes.filter((m) => isModeAvailableForLanguage(modeData[m], language)),
    [modes, language, modeData],
  );

  // A language switch can make the current mode unavailable (see
  // isModeAvailableForLanguage) — fall back to the first (always-available)
  // mode rather than leaving the game on a now-hidden one. Also self-heals
  // a mode persisted from before this mode became folder-driven (e.g. an
  // old "numbers10"/"letters" value in localStorage that no longer
  // corresponds to any folder) once the real mode list loads.
  useEffect(() => {
    if (!availableModes.includes(mode) && availableModes.length > 0) setMode(availableModes[0]);
  }, [availableModes, mode, setMode]);

  // A mode's title.json for the current language (if any) overrides its
  // regular next-intl translation — lets a mode's display name switch
  // along with the selected game language. Falls back to the mode's
  // English title, then to a prettified folder name, for a mode that
  // hasn't (yet) shipped a title.json in every language.
  const modeLabel = (m: BalloonMode): string => {
    const data = modeData[m];
    return data?.titles[language] ?? data?.titles.en ?? prettifyModeName(m);
  };

  const quizQuestionFormat =
    currentModeData.quizFormats[language] ?? currentModeData.quizFormats.en ?? DEFAULT_QUESTION_FORMAT[language];

  const soundInfo = useMemo(
    () => currentModeData.sounds[language] ?? { names: [], soundsPath: null },
    [currentModeData, language],
  );

  // The fixed subset of `mode`'s cards that both the "game" (balloon) and
  // "learning" (flashcard) screens draw from — re-picked only when `mode`,
  // `cardCount`, or the underlying card data changes, so toggling between
  // the two screens never reshuffles it. `null` while the mode's data
  // hasn't finished loading yet, or once loaded, if it turns out to have no
  // cards at all.
  const selectedCards = useMemo(() => {
    const cards = currentModeData.cards;
    if (cards.length === 0) return null;
    const unique = uniqueByKey(cards);
    return shuffle(unique).slice(0, Math.min(cardCount, unique.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cardCount, currentModeData.cards]);

  // `selectedCards` resolved to this language's actual display text (see
  // resolveCardName) — what every screen and the quiz actually show/speak.
  const displayCards: LearningCard[] | null = useMemo(() => {
    if (!selectedCards) return null;
    return selectedCards.map((card) => ({
      key: card.key,
      name: resolveCardName(card, language, currentModeData),
      image: card.image,
    }));
  }, [selectedCards, language, currentModeData]);

  const hasCards = Boolean(displayCards && displayCards.length > 0);

  // Speaks `card` — plays the recorded pronunciation if this language's
  // sounds folder covers its canonical key, otherwise falls back to Piper
  // TTS on its (possibly translated, see resolveCardName) display name.
  const playCard = (card: { key: string; name: string }) => {
    if (soundInfo.soundsPath && soundInfo.names.includes(card.key)) {
      playRecordedSound(soundInfo.soundsPath, card.key);
    } else {
      speak(card.name, language, "short");
    }
  };

  // "Learning" only makes sense for a mode with cards to show — falls back
  // to "game" if the mode changes to one without any (e.g. the settings
  // panel's mode dropdown is switched away mid-session, or briefly while a
  // freshly-selected mode's data is still loading).
  useEffect(() => {
    if (!hasCards && screenMode === "learning") setScreenMode("game");
  }, [hasCards, screenMode, setScreenMode]);

  useBackgroundMusic();

  useEffect(() => {
    // Paused while the bonus quiz overlay is open, while showing the static
    // "learning" card grid instead of falling balloons, or while the
    // current mode's cards haven't loaded yet.
    if (quizQuestions || screenMode === "learning") return;
    if (!displayCards) return;
    const interval = setInterval(() => {
      setBalloons((current) => {
        if (current.length >= maxOnScreen) return current;

        const canSpawnQuizBalloon = !current.some((b) => b.isQuizBalloon) && Math.random() < QUIZ_BALLOON_SPAWN_CHANCE;
        const content = canSpawnQuizBalloon
          ? { label: "?", color: QUIZ_BALLOON_COLOR, cardKey: "", speech: "" }
          : generateBalloonContent(mode, displayCards);

        const balloon: FallingBalloon = {
          id: nextBalloonId++,
          left: randomBetween(4, 82),
          color: content.color,
          duration: randomBetween(6, 11) / speed,
          delay: 0,
          size: randomBetween(size * 0.75, size * 1.25),
          label: content.label,
          image: "image" in content ? content.image : undefined,
          textColor: "textColor" in content ? content.textColor : undefined,
          cardKey: content.cardKey,
          speech: content.speech,
          isQuizBalloon: canSpawnQuizBalloon,
        };
        return [...current, balloon];
      });
    }, SPAWN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [size, speed, maxOnScreen, mode, quizQuestions, screenMode, displayCards]);

  // Warms the voice model cache as soon as a language is selected, so the
  // first popped balloon doesn't stall on a multi-megabyte download — then
  // pre-synthesizes every card this mode can speak (its full set, not just
  // the displayed subset, so re-shuffling on a cardCount/mode change never
  // pays synthesis cost live either) that isn't already covered by a
  // recorded pronunciation, so pops play back instantly from cache instead
  // of paying full TTS synthesis latency (piper-tts rebuilds its inference
  // session from scratch on every call). Skipped entirely while muted, or
  // once every card the mode can speak turns out to have a recording of
  // its own — no point downloading/synthesizing voices nothing will play.
  useEffect(() => {
    const remainingVocabulary = currentModeData.cards
      .filter((card) => !soundInfo.names.includes(card.key))
      .map((card) => resolveCardName(card, language, currentModeData));
    if (muted || remainingVocabulary.length === 0) return;
    let cancelled = false;
    void prefetchVoice(language, "short").then(() => {
      if (!cancelled) warmupSpeech(remainingVocabulary, language, "short");
    });
    return () => {
      cancelled = true;
    };
  }, [mode, language, muted, currentModeData, soundInfo]);

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
    addDiamondFlight(from);

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
      setQuizQuestions(buildBalloonQuizQuestions(displayCards ?? []));
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
    if (!muted) playCard({ key: balloon.cardKey, name: balloon.speech });
    setScore((current) => current + 1);
    setScoreBump((current) => current + 1);
  };

  // Awards the same +1 ruby a popped balloon gives, the first time a card
  // is tapped in the "learning" flashcard grid — BalloonLearningCards
  // dedupes repeat taps of an already-learned card itself, so this only
  // fires once per card per `displayCards` selection.
  const handleCardLearned = () => {
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
    addDiamondFlight(from);

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
              onChange={(e) => setMode(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
            >
              {availableModes.map((m) => (
                <option key={m} value={m}>
                  {modeLabel(m)}
                </option>
              ))}
            </select>
          </label>
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

      {screenMode === "learning" && displayCards ? (
        <BalloonLearningCards items={displayCards} muted={muted} onPlay={playCard} onCardLearned={handleCardLearned} />
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
        <BalloonQuiz
          questions={quizQuestions}
          language={language}
          questionFormat={quizQuestionFormat}
          muted={muted}
          onFinish={handleQuizFinish}
        />
      )}

      {hasCards && (
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
