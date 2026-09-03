"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BalloonPopGame } from "@/components/preschool/balloon-pop-game";
import { TrainsGame } from "@/components/preschool/trains-game";
import { ReadingGame } from "@/components/preschool/reading-game";
import { CardsGame } from "@/components/preschool/cards-game";
import { StoriesGame } from "@/components/preschool/stories-game";
import type { PreschoolGameId } from "@/components/preschool/game-choice";
import { usePreschoolGamesGuard } from "@/components/preschool/game-shell";

// Full-screen player for one preschool minigame at its own URL
// (/games/balloons, /games/trains, /games/reading, /games/cards,
// /games/stories — see games-page.tsx for the picker that links here).
// Trains fills the screen edge-to-edge; the others are capped and centered
// on wide screens (xl:max-w-*, same "don't cap below xl" convention as
// components/page-container.tsx) so they don't spread across an ultrawide
// monitor into an unplayably wide area.
export function GamePlayPage({ game }: { game: PreschoolGameId }) {
  const t = useTranslations("PreschoolGameChoice");
  const allowed = usePreschoolGamesGuard();

  if (!allowed) {
    return null;
  }

  return (
    <div className="relative flex flex-1 flex-col bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
      {game === "balloons" ? (
        <div className="mx-auto flex w-full flex-1 flex-col p-2 xl:max-w-5xl sm:p-4">
          <BalloonPopGame />
        </div>
      ) : game === "reading" ? (
        <div className="mx-auto flex w-full flex-1 flex-col p-2 xl:max-w-5xl sm:p-4">
          <ReadingGame />
        </div>
      ) : game === "cards" ? (
        <div className="mx-auto flex w-full flex-1 flex-col p-2 xl:max-w-5xl sm:p-4">
          <CardsGame />
        </div>
      ) : game === "stories" ? (
        <div className="mx-auto flex w-full flex-1 flex-col p-2 xl:max-w-5xl sm:p-4">
          <StoriesGame />
        </div>
      ) : (
        <TrainsGame />
      )}
      <Link
        href="/games"
        aria-label={t("switchGame")}
        className="absolute bottom-4 left-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        🔁
      </Link>
    </div>
  );
}
