"use client";

import { BalloonPopGame } from "./balloon-pop-game";
import { TrainsGame } from "./trains-game";
import { ReadingGame } from "./reading-game";
import { CardsGame } from "./cards-game";
import { StoriesGamePage } from "./stories-game";
import type { PreschoolGameId } from "./game-choice";
import { usePreschoolGamesGuard } from "./game-shell";
import { GamePageContainer } from "./kit/game-page-container";
import { BackToGamesButton } from "./kit/back-to-games-button";

// Full-screen player for one preschool minigame at its own URL
// (/games/balloons, /games/trains, /games/reading, /games/cards,
// /games/stories[/<storySlug>] — see games-page.tsx for the picker that
// links here). Trains fills the screen edge-to-edge; the others are capped
// and centered on wide screens (xl:max-w-*, same "don't cap below xl"
// convention as components/page-container.tsx) so they don't spread across
// an ultrawide monitor into an unplayably wide area.
//
// `storySlug` is only meaningful for game === "stories" — set when this is
// reached via /games/stories/[storySlug]/page.tsx, so a specific story
// opens directly (and stays open across a reload, since it's part of the
// URL rather than component state — see stories-game.tsx's StoriesGamePage).
export function GamePlayPage({ game, storySlug }: { game: PreschoolGameId; storySlug?: string }) {
  const allowed = usePreschoolGamesGuard();

  if (!allowed) {
    return null;
  }

  return (
    <GamePageContainer>
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
          <StoriesGamePage slug={storySlug ?? null} basePath="/games/stories" />
        </div>
      ) : (
        <TrainsGame />
      )}
      <BackToGamesButton href="/games" />
    </GamePageContainer>
  );
}
