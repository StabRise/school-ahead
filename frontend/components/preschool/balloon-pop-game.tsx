"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

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
  number: number; // 1-20, printed on the balloon
}

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  dx: number;
  dy: number;
}

const BALLOON_COLORS = ["#f87171", "#fb923c", "#fbbf24", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6"];
const SPAWN_INTERVAL_MS = 850;
const PARTICLES_PER_POP = 10;

// Sliders' defaults reproduce the original hardcoded values exactly: size
// randomBetween(84, 140) is base=112 ± 25%, duration randomBetween(6, 11) is
// speed=1 (i.e. unscaled), and 9 was the original MAX_ON_SCREEN.
const DEFAULT_SIZE = 112;
const MIN_SIZE = 60;
const MAX_SIZE = 200;
const DEFAULT_SPEED = 1;
const MIN_SPEED = 0.5;
const MAX_SPEED = 3;
const DEFAULT_COUNT = 9;
const MIN_COUNT = 3;
const MAX_COUNT = 24;

let nextBalloonId = 0;
let nextParticleId = 0;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomColor(): string {
  return BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)];
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
          fontSize="14"
          fontWeight="700"
          fill="white"
          style={{ paintOrder: "stroke" }}
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="0.5"
        >
          {balloon.number}
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
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [maxOnScreen, setMaxOnScreen] = useState(DEFAULT_COUNT);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setBalloons((current) => {
        if (current.length >= maxOnScreen) return current;
        const balloon: FallingBalloon = {
          id: nextBalloonId++,
          left: randomBetween(4, 82),
          color: randomColor(),
          duration: randomBetween(6, 11) / speed,
          delay: 0,
          size: randomBetween(size * 0.75, size * 1.25),
          number: Math.floor(randomBetween(1, 21)),
        };
        return [...current, balloon];
      });
    }, SPAWN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [size, speed, maxOnScreen]);

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
