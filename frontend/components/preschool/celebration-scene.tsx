"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Butterfly, Daisy, Mushroom, Tulip } from "@/components/preschool/decorations";
import { pseudoRandom } from "@/components/preschool/random";
import { Raccoon } from "@/components/preschool/raccoon";

// The magical "lesson complete" clearing — sunbeams, fireflies, a bunting
// garland, a stump piled with coins and crystals, and the raccoon bouncing
// with its trophy. See docs/interfaces/student/preschool/lesson.md.

const CONFETTI_COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6"];
const CONFETTI_COUNT = 26;
const FIREFLY_COUNT = 7;

function SunRays() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-0 h-[160%] w-[160%] opacity-20"
      style={{
        background:
          "repeating-conic-gradient(from 0deg, rgba(255,251,235,0.95) 0deg 8deg, transparent 8deg 20deg)",
        animation: "sun-spin 50s linear infinite",
      }}
    />
  );
}

function Firefly({ style }: { style?: React.CSSProperties }) {
  return (
    <span
      className="absolute h-2.5 w-2.5 rounded-full bg-yellow-200"
      style={{ boxShadow: "0 0 8px 4px rgba(253, 224, 71, 0.9)", ...style }}
    />
  );
}

function Dandelion({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 30 46"
      className={className}
      aria-hidden="true"
      style={{ animation: "dandelion-sway 3.5s ease-in-out infinite", transformOrigin: "50% 100%" }}
    >
      <path d="M15 44V20" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" />
      <g stroke="#e5e7eb" strokeWidth="1">
        {Array.from({ length: 16 }, (_, i) => {
          const angle = (i / 16) * Math.PI * 2;
          const x2 = 15 + Math.cos(angle) * 12;
          const y2 = 12 + Math.sin(angle) * 12;
          return <line key={i} x1="15" y1="12" x2={x2} y2={y2} />;
        })}
      </g>
      <circle cx="15" cy="12" r="3" fill="#f9fafb" />
    </svg>
  );
}

function Garland({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 60" className={className} aria-hidden="true" preserveAspectRatio="none">
      <path d="M0 6 Q200 50 400 6" stroke="#78716c" strokeWidth="2" fill="none" />
      {Array.from({ length: 11 }, (_, i) => {
        const t = i / 10;
        const x = t * 400;
        const y = 6 + Math.sin(t * Math.PI) * 44;
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        return <polygon key={i} points={`${x - 8},${y} ${x + 8},${y} ${x},${y + 16}`} fill={color} />;
      })}
    </svg>
  );
}

function Stump({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} aria-hidden="true">
      <rect x="20" y="50" width="80" height="40" rx="6" fill="#92400e" />
      <rect x="20" y="50" width="80" height="8" fill="#78350f" />
      <ellipse cx="60" cy="48" rx="42" ry="16" fill="#d6a15c" />
      <ellipse cx="60" cy="48" rx="30" ry="11" fill="none" stroke="#b7844a" strokeWidth="2" />
      <ellipse cx="60" cy="48" rx="17" ry="6" fill="none" stroke="#b7844a" strokeWidth="2" />
      <circle cx="42" cy="40" r="8" fill="#fbbf24" stroke="#d97706" strokeWidth="1.5" />
      <circle cx="58" cy="36" r="8" fill="#fde68a" stroke="#d97706" strokeWidth="1.5" />
      <circle cx="73" cy="42" r="7" fill="#fbbf24" stroke="#d97706" strokeWidth="1.5" />
      <polygon points="50,44 55,32 60,44 55,50" fill="#a78bfa" opacity="0.9" />
      <polygon points="66,42 70,33 74,42 70,48" fill="#38bdf8" opacity="0.9" />
    </svg>
  );
}

function Trophy({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 32"
      className={className}
      aria-hidden="true"
      style={{ left: "50%", animation: "trophy-shine 1.6s ease-in-out infinite" }}
    >
      <path d="M6 4h16v8a8 8 0 0 1-16 0z" fill="#fbbf24" stroke="#d97706" strokeWidth="1.2" />
      <path d="M6 6H2a4 4 0 0 0 4 6M22 6h4a4 4 0 0 1-4 6" fill="none" stroke="#d97706" strokeWidth="1.4" />
      <rect x="12" y="20" width="4" height="6" fill="#d97706" />
      <rect x="8" y="26" width="12" height="4" rx="1" fill="#d97706" />
      <path d="M11 9l2 2 4-4" stroke="#fff7ed" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Big, invitingly-swaying "back to the path" button — the same sway as the
// active step on the adventure road, so it reads as "tap me" the same way.
function HomeButton() {
  const t = useTranslations("CelebrationScene");
  return (
    <Link
      href="/"
      aria-label={t("homeButton")}
      className="flex items-center justify-center rounded-full border-4 border-white bg-gradient-to-b from-sky-400 to-blue-500 shadow-2xl transition-transform hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      style={{ width: 84, height: 84, animation: "node-sway 2.6s ease-in-out infinite", transformOrigin: "50% 110%" }}
    >
      <svg viewBox="0 0 24 24" className="h-10 w-10 text-white" aria-hidden="true">
        <path
          d="M4 12L12 5l8 7M6 10.5V19h4v-5h4v5h4v-8.5"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

function ConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        id: i,
        left: pseudoRandom(i * 3.1) * 100,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: pseudoRandom(i * 5.7) * 0.6,
        duration: 1.8 + pseudoRandom(i * 2.3) * 1.2,
        rotate: pseudoRandom(i * 7.9) * 360,
      })),
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 h-3 w-2 rounded-sm"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}

// A short procedural fanfare — no audio asset pipeline exists in this
// project, same approach as the balloon-pop minigame's pop sound.
function playFanfare() {
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.12;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.4);
    });
    window.setTimeout(() => ctx.close(), (notes.length * 0.12 + 0.4) * 1000);
  } catch {
    // Best-effort only — never block the celebration on audio failures.
  }
}

export function CelebrationScene({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  const fireflies = useMemo(
    () =>
      Array.from({ length: FIREFLY_COUNT }, (_, i) => ({
        id: i,
        left: 8 + pseudoRandom(i * 4.4) * 84,
        top: 12 + pseudoRandom(i * 6.6) * 55,
        delay: pseudoRandom(i * 9.1) * 2,
        duration: 2 + pseudoRandom(i * 3.3) * 1.5,
      })),
    [],
  );

  useEffect(() => {
    playFanfare();
  }, []);

  return (
    <div className="relative flex w-full max-w-xl flex-1 flex-col items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-b from-amber-100 via-emerald-200 to-emerald-300 px-4 py-8 text-center shadow-2xl">
      <SunRays />
      <Garland className="absolute inset-x-0 top-0 h-14 w-full" />

      <div className="pointer-events-none absolute inset-0">
        {fireflies.map((f) => (
          <Firefly
            key={f.id}
            style={{
              left: `${f.left}%`,
              top: `${f.top}%`,
              animation: `firefly-twinkle ${f.duration}s ease-in-out infinite`,
              animationDelay: `${f.delay}s`,
            }}
          />
        ))}
        <Butterfly
          color="#f472b6"
          className="absolute left-[12%] top-[24%] h-8 w-8"
          style={{ animation: "flutter-a 3.6s ease-in-out infinite" }}
        />
        <Butterfly
          color="#38bdf8"
          className="absolute right-[14%] top-[30%] h-7 w-7"
          style={{ animation: "flutter-b 3s ease-in-out infinite 0.5s" }}
        />
        <Dandelion className="absolute bottom-2 left-4 h-16 w-10 opacity-90" />
        <Dandelion className="absolute bottom-0 right-10 h-12 w-8 opacity-80" />
        <Mushroom className="absolute bottom-2 right-4 h-10 w-9" />
        <Daisy className="absolute bottom-6 left-1/4 h-6 w-6" color="#fca5a5" />
        <Tulip className="absolute bottom-2 left-[38%] h-9 w-7" />
      </div>

      <ConfettiBurst />

      <Stump className="relative z-10 -mb-2 h-20 w-28" />

      <div className="relative z-10 h-28 w-28">
        <Raccoon mood="happy" className="h-28 w-28" />
        <Trophy className="absolute -bottom-1 h-9 w-9" />
      </div>

      <p className="relative z-10 mt-3 text-2xl font-extrabold text-emerald-900">{title}</p>
      {subtitle && <p className="relative z-10 text-base text-emerald-800">{subtitle}</p>}

      <div className="relative z-10 mt-2">
        <HomeButton />
      </div>
      {children && <div className="relative z-10 mt-2">{children}</div>}
    </div>
  );
}
