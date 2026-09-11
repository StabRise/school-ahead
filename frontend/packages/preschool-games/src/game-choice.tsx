"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { BalloonPopGame } from "./balloon-pop-game";
import { TrainsGame } from "./trains-game";
import { ReadingGame } from "./reading-game";
import { CardsGame } from "./cards-game";
import { StoriesGame } from "./stories-game";
import { MathGame } from "./math-game";
import { HomeButton } from "./kit/home-button";

// Celebration screen shown once every one of today's lessons (tails
// included) is Completed, Pending Review, or Need Help — see
// components/student-dashboard.tsx's READY_FOR_GAME_STATUSES check and
// docs/views/preschool/README.md. Lets the child pick which reward minigame
// to play instead of always jumping straight into Balloon Pop; Balloons
// stays the visually recommended/default pick. Local-state-driven (not
// routed) since it's an inline overlay on the dashboard, not a page of its
// own — contrast the standalone /games entry point (games-page.tsx,
// game-play-page.tsx), which reuses this file's GamePicker/GameCard but
// navigates to /games/{game} instead so each game has its own URL.
export type PreschoolGameId = "balloons" | "trains" | "reading" | "cards" | "stories" | "math" | "jumping-frogs";

function BalloonIcon() {
  return (
    <svg viewBox="0 0 40 52" className="h-16 w-16 drop-shadow" aria-hidden="true">
      <ellipse cx="20" cy="20" rx="18" ry="20" fill="#fb7185" />
      <ellipse cx="14" cy="12" rx="4" ry="6" fill="white" opacity="0.35" />
      <path d="M20 40 L17 46 L23 46 Z" fill="#fb7185" />
      <line x1="20" y1="46" x2="20" y2="52" stroke="#94a3b8" strokeWidth="1" />
    </svg>
  );
}

function TrainIcon() {
  return (
    <svg viewBox="0 0 100 60" className="h-16 w-16 drop-shadow" aria-hidden="true">
      <circle cx="18" cy="50" r="7" fill="#334155" />
      <circle cx="38" cy="50" r="7" fill="#334155" />
      <circle cx="70" cy="50" r="7" fill="#334155" />
      <circle cx="90" cy="50" r="7" fill="#334155" />
      <rect x="6" y="18" width="42" height="28" rx="6" fill="#38bdf8" />
      <rect x="12" y="4" width="14" height="14" rx="2" fill="#38bdf8" />
      <rect x="52" y="14" width="42" height="32" rx="6" fill="#fbbf24" />
    </svg>
  );
}

function ReadingIcon() {
  return (
    <svg viewBox="0 0 64 52" className="h-16 w-16 drop-shadow" aria-hidden="true">
      <rect x="4" y="6" width="24" height="40" rx="4" fill="#fbbf24" />
      <rect x="36" y="6" width="24" height="40" rx="4" fill="#38bdf8" />
      <path d="M28 6 Q32 12 36 6 V46 Q32 40 28 46 Z" fill="#f1f5f9" />
      <text x="16" y="30" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#0369a1">
        М
      </text>
      <text x="48" y="30" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#dc2626">
        А
      </text>
    </svg>
  );
}

function CardsIcon() {
  return (
    <svg viewBox="0 0 64 52" className="h-16 w-16 drop-shadow" aria-hidden="true">
      <rect x="4" y="8" width="24" height="36" rx="4" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="2" />
      <rect x="26" y="4" width="24" height="36" rx="4" fill="white" stroke="#cbd5e1" strokeWidth="2" />
      <text x="38" y="24" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#0369a1">
        М
      </text>
      <text x="47" y="24" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#dc2626">
        А
      </text>
      <circle cx="38" cy="32" r="5" fill="#fbbf24" />
    </svg>
  );
}

function StoriesIcon() {
  return (
    <svg viewBox="0 0 56 52" className="h-16 w-16 drop-shadow" aria-hidden="true">
      <path d="M28 10 C22 6 12 6 6 9 V42 C12 39 22 39 28 43 Z" fill="#fbbf24" />
      <path d="M28 10 C34 6 44 6 50 9 V42 C44 39 34 39 28 43 Z" fill="#fb923c" />
      <line x1="28" y1="10" x2="28" y2="43" stroke="#c2410c" strokeWidth="1.5" />
      <circle cx="17" cy="22" r="4" fill="#fff7ed" />
    </svg>
  );
}

function MathIcon() {
  return (
    <svg viewBox="0 0 56 56" className="h-16 w-16 drop-shadow" aria-hidden="true">
      <rect x="4" y="24" width="14" height="10" rx="2" fill="#22c55e" />
      <rect x="21" y="24" width="14" height="10" rx="2" fill="#a3e635" />
      <rect x="38" y="24" width="14" height="10" rx="2" fill="#22c55e" />
      <rect x="18" y="4" width="20" height="18" rx="3" fill="#c68a5c" />
      <rect x="22" y="9" width="3" height="3" fill="#2b1a0e" />
      <rect x="31" y="9" width="3" height="3" fill="#2b1a0e" />
      <text x="28" y="48" textAnchor="middle" fontSize="18" fontWeight="bold" fill="#0369a1">
        ×
      </text>
    </svg>
  );
}

function JumpingFrogsIcon() {
  return (
    <svg viewBox="0 0 56 48" className="h-16 w-16 drop-shadow" aria-hidden="true">
      <ellipse cx="28" cy="40" rx="24" ry="6" fill="#4ade80" opacity="0.7" />
      <ellipse cx="28" cy="24" rx="18" ry="14" fill="#22c55e" />
      <circle cx="19" cy="14" r="5" fill="#22c55e" />
      <circle cx="37" cy="14" r="5" fill="#22c55e" />
      <circle cx="19" cy="13" r="2.5" fill="#052e16" />
      <circle cx="37" cy="13" r="2.5" fill="#052e16" />
      <ellipse cx="28" cy="28" rx="6" ry="4" fill="#166534" />
    </svg>
  );
}

// Each game's own accent color — the thick colored ring around its card
// (see GameCard) and the "Play" pill's background, so the cards read as
// distinct at a glance instead of all being the same gray box.
const GAME_ACCENTS: Record<PreschoolGameId, { ring: string; play: string }> = {
  balloons: { ring: "ring-rose-300", play: "bg-rose-500" },
  trains: { ring: "ring-sky-300", play: "bg-sky-500" },
  reading: { ring: "ring-orange-300", play: "bg-orange-500" },
  cards: { ring: "ring-amber-300", play: "bg-amber-500" },
  stories: { ring: "ring-violet-300", play: "bg-violet-500" },
  math: { ring: "ring-lime-300", play: "bg-lime-600" },
  "jumping-frogs": { ring: "ring-emerald-300", play: "bg-emerald-500" },
};

function GameCard({
  game,
  title,
  subtitle,
  icon,
  onSelect,
}: {
  game: PreschoolGameId;
  title: string;
  subtitle: string;
  icon: ReactNode;
  onSelect: () => void;
}) {
  const t = useTranslations("PreschoolGameChoice");
  const accent = GAME_ACCENTS[game];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-40 flex-col items-center gap-2 rounded-3xl bg-white p-4 text-center shadow-lg ring-4 transition hover:scale-105 sm:w-48 sm:gap-3 sm:p-5 ${accent.ring}`}
    >
      {icon}
      <span className="text-base font-bold text-gray-700 sm:text-lg">{title}</span>
      <span className="text-xs text-gray-500 sm:text-sm">{subtitle}</span>
      {/* Pushes the button to the same spot at the bottom of every card
          regardless of how many lines the title/subtitle above wrapped to
          — paired with the row's items-stretch so every card in a row is
          the same height to begin with. */}
      <span
        className={`mt-auto w-full rounded-full px-4 py-2 text-sm font-extrabold text-white ${accent.play}`}
      >
        {t("playButton")}
      </span>
    </button>
  );
}

// Exported so the standalone /games route (components/preschool/
// games-page.tsx) can reuse the exact same picker UI, wired to navigate to
// /games/{game} instead of setting local state — see that file.
export function GamePicker({
  title,
  subtitle,
  onSelect,
}: {
  title: string;
  subtitle: string;
  onSelect: (game: PreschoolGameId) => void;
}) {
  const t = useTranslations("PreschoolGameChoice");
  return (
    <div className="flex flex-1 flex-col items-center gap-6 overflow-y-auto p-6 text-center">
      <div className="flex flex-col items-center gap-1">
        <p className="text-2xl font-bold text-gray-700">{title}</p>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
      {/* flex-wrap (not a single fixed row) — however many games there
          are, this always wraps into as many rows as the viewport's width
          needs, from one column on a phone up to all five side by side on
          a wide desktop, rather than overflowing off-screen. items-stretch
          (not items-start) so every card in a row matches the tallest
          one's height, regardless of how many lines its own subtitle
          wraps to — see GameCard's h-full + mt-auto button. */}
      <div className="flex flex-wrap items-stretch justify-center gap-4 sm:gap-6">
        <GameCard
          game="balloons"
          title={t("balloonsTitle")}
          subtitle={t("balloonsSubtitle")}
          icon={<BalloonIcon />}
          onSelect={() => onSelect("balloons")}
        />
        <GameCard
          game="trains"
          title={t("trainsTitle")}
          subtitle={t("trainsSubtitle")}
          icon={<TrainIcon />}
          onSelect={() => onSelect("trains")}
        />
        <GameCard
          game="reading"
          title={t("readingTitle")}
          subtitle={t("readingSubtitle")}
          icon={<ReadingIcon />}
          onSelect={() => onSelect("reading")}
        />
        <GameCard
          game="cards"
          title={t("cardsTitle")}
          subtitle={t("cardsSubtitle")}
          icon={<CardsIcon />}
          onSelect={() => onSelect("cards")}
        />
        <GameCard
          game="stories"
          title={t("storiesTitle")}
          subtitle={t("storiesSubtitle")}
          icon={<StoriesIcon />}
          onSelect={() => onSelect("stories")}
        />
        <GameCard
          game="math"
          title={t("mathTitle")}
          subtitle={t("mathSubtitle")}
          icon={<MathIcon />}
          onSelect={() => onSelect("math")}
        />
        <GameCard
          game="jumping-frogs"
          title={t("jumpingFrogsTitle")}
          subtitle={t("jumpingFrogsSubtitle")}
          icon={<JumpingFrogsIcon />}
          onSelect={() => onSelect("jumping-frogs")}
        />
      </div>
    </div>
  );
}

export function PreschoolCelebration({
  title,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
} = {}) {
  const t = useTranslations("PreschoolGameChoice");
  const [selectedGame, setSelectedGame] = useState<PreschoolGameId | null>(null);

  if (!selectedGame) {
    return (
      <GamePicker
        title={title ?? t("title")}
        subtitle={subtitle ?? t("subtitle")}
        onSelect={setSelectedGame}
      />
    );
  }

  return (
    <div className="relative flex flex-1 flex-col">
      {selectedGame === "balloons" ? (
        <div className="flex flex-1 flex-col p-2 sm:p-4">
          <BalloonPopGame />
        </div>
      ) : selectedGame === "reading" ? (
        <div className="flex flex-1 flex-col p-2 sm:p-4">
          <ReadingGame />
        </div>
      ) : selectedGame === "cards" ? (
        <div className="flex flex-1 flex-col p-2 sm:p-4">
          <CardsGame />
        </div>
      ) : selectedGame === "stories" ? (
        <div className="flex flex-1 flex-col p-2 sm:p-4">
          <StoriesGame />
        </div>
      ) : selectedGame === "math" ? (
        <div className="flex flex-1 flex-col p-2 sm:p-4">
          <MathGame />
        </div>
      ) : (
        <TrainsGame />
      )}
      <HomeButton onClick={() => setSelectedGame(null)} />
    </div>
  );
}
