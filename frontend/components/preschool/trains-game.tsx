"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { prefetchVoice, speak, type SpeechLanguage as GameLanguage } from "@/lib/piper-tts";

// Celebration reward minigame, alternative to BalloonPopGame — same trigger
// (every one of today's lessons, tails included, is Completed) but themed
// around a train that arrives carrying a letter and waits for the matching
// physical keyboard key. See docs/interfaces/preschool.md section 2.4 and
// docs/views/preschool/README.md ("Letter Train celebration").

type TrainPhase = "arriving" | "waiting" | "departing";

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
  pl: [
    "A", "Ą", "B", "C", "Ć", "D", "E", "Ę", "F", "G", "H", "I", "J",
    "K", "L", "Ł", "M", "N", "Ń", "O", "Ó", "P", "R", "S", "Ś", "T",
    "U", "W", "Y", "Z", "Ź", "Ż",
  ],
};

const WAGON_COLOR_HEXES = ["#f87171", "#fb923c", "#fbbf24", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6"];

const GAME_LANGUAGES: GameLanguage[] = ["en", "uk", "pl"];
const DEFAULT_LANGUAGE: GameLanguage = "en";

const ARRIVE_DURATION_S = 2.2;
const DEPART_DURATION_S = 1.8;

function randomColor(): string {
  return WAGON_COLOR_HEXES[Math.floor(Math.random() * WAGON_COLOR_HEXES.length)];
}

// Avoids handing out the same letter twice in a row.
function pickNextLetter(language: GameLanguage, exclude?: string): string {
  const pool = LETTERS[language];
  if (pool.length <= 1) return pool[0];
  let letter = pool[Math.floor(Math.random() * pool.length)];
  while (letter === exclude) {
    letter = pool[Math.floor(Math.random() * pool.length)];
  }
  return letter;
}

// Two ascending notes — no audio asset pipeline exists in this project, so
// the "correct key" chime is synthesized like the balloon game's pop sound.
function playChime() {
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    [523.25, 783.99].forEach((freq, index) => {
      const startAt = ctx.currentTime + index * 0.12;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(freq, startAt);
      gain.gain.setValueAtTime(0.001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.25, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.25);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.26);
    });
    setTimeout(() => ctx.close(), 400);
  } catch {
    // Best-effort only — never block on audio failures (autoplay
    // restrictions, unsupported browser, ...).
  }
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
      <rect x="168" y="6" width="14" height="20" rx="3" fill="#7f1d1d" />
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

  // Picks the very first letter client-side only, after mount — doing this
  // in a useState initializer would run during server render too and mismatch
  // against the client's random pick. Deferred a tick (rather than set
  // directly in the effect body) to avoid cascading renders.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setCurrentLetter(pickNextLetter(DEFAULT_LANGUAGE));
      setWagonColor(randomColor());
    }, 0);
    return () => clearTimeout(timeout);
  }, []);

  // Warms the voice model cache as soon as a language is selected, so the
  // first arriving train doesn't stall its speech on a multi-megabyte download.
  useEffect(() => {
    void prefetchVoice(language, "short");
  }, [language]);

  useEffect(() => {
    if (phase === "waiting" && currentLetter) {
      speak(currentLetter, language, "short");
    }
  }, [phase, currentLetter, language]);

  useEffect(() => {
    if (phase !== "waiting" || !currentLetter) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length !== 1) return;
      if (event.key.toUpperCase() !== currentLetter.toUpperCase()) return;
      playChime();
      setCollected((current) => [...current, currentLetter]);
      setCollectedBump((current) => current + 1);
      setPhase("departing");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, currentLetter]);

  const handleAnimationEnd = () => {
    if (phase === "arriving") {
      setPhase("waiting");
    } else if (phase === "departing") {
      setCurrentLetter((previous) => pickNextLetter(language, previous ?? undefined));
      setWagonColor(randomColor());
      setTrainKey((key) => key + 1);
      setPhase("arriving");
    }
  };

  const animation =
    phase === "arriving"
      ? `train-arrive ${ARRIVE_DURATION_S}s ease-out forwards`
      : phase === "departing"
        ? `train-depart ${DEPART_DURATION_S}s ease-in forwards`
        : undefined;

  return (
    <div className="relative min-h-[32rem] flex-1 overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 pt-6 text-center">
        <p className="text-xl font-bold text-gray-700">{t("title")}</p>
        <p className="text-sm text-gray-500">
          {phase === "waiting" && currentLetter ? t("instruction", { letter: currentLetter }) : t("subtitle")}
        </p>
      </div>

      <div
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
        </div>
      )}

      <div className="absolute inset-x-0 bottom-16 z-0 h-2 bg-gray-400/40" />

      {currentLetter && (
        <div
          key={trainKey}
          className="absolute bottom-24"
          style={{ left: phase === "arriving" ? "-40%" : "50%", transform: "translateX(-50%)", animation }}
          onAnimationEnd={handleAnimationEnd}
        >
          <TrainNode letter={currentLetter} color={wagonColor} />
        </div>
      )}
    </div>
  );
}
