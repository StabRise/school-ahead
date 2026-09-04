"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { BalloonPopGame } from "./balloon-pop-game";
import { TrainsGame } from "./trains-game";
import { ReadingGame } from "./reading-game";
import { CardsGame } from "./cards-game";
import { StoriesGame } from "./stories-game";
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
export type PreschoolGameId = "balloons" | "trains" | "reading" | "cards" | "stories";

const DEFAULT_GAME: PreschoolGameId = "balloons";

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

function GameCard({
  title,
  subtitle,
  icon,
  highlighted,
  onSelect,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  highlighted?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-56 flex-col items-center gap-2 rounded-3xl bg-white p-6 text-center shadow-lg ring-2 transition hover:scale-[1.03] ${
        highlighted ? "ring-rose-300" : "ring-gray-200"
      }`}
    >
      {icon}
      <span className="text-lg font-bold text-gray-700">{title}</span>
      <span className="text-sm text-gray-500">{subtitle}</span>
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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex flex-col items-center gap-1">
        <p className="text-2xl font-bold text-gray-700">{title}</p>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <GameCard
          title={t("balloonsTitle")}
          subtitle={t("balloonsSubtitle")}
          icon={<BalloonIcon />}
          highlighted={DEFAULT_GAME === "balloons"}
          onSelect={() => onSelect("balloons")}
        />
        <GameCard
          title={t("trainsTitle")}
          subtitle={t("trainsSubtitle")}
          icon={<TrainIcon />}
          highlighted={DEFAULT_GAME === "trains"}
          onSelect={() => onSelect("trains")}
        />
        <GameCard
          title={t("readingTitle")}
          subtitle={t("readingSubtitle")}
          icon={<ReadingIcon />}
          highlighted={DEFAULT_GAME === "reading"}
          onSelect={() => onSelect("reading")}
        />
        <GameCard
          title={t("cardsTitle")}
          subtitle={t("cardsSubtitle")}
          icon={<CardsIcon />}
          highlighted={DEFAULT_GAME === "cards"}
          onSelect={() => onSelect("cards")}
        />
        <GameCard
          title={t("storiesTitle")}
          subtitle={t("storiesSubtitle")}
          icon={<StoriesIcon />}
          highlighted={DEFAULT_GAME === "stories"}
          onSelect={() => onSelect("stories")}
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
      ) : (
        <TrainsGame />
      )}
      <HomeButton onClick={() => setSelectedGame(null)} />
    </div>
  );
}
