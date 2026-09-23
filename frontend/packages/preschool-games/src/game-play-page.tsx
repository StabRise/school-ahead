"use client";

import { useTranslations } from "next-intl";
import { BalloonPopGame } from "./balloon-pop-game";
import { TrainsGame } from "./trains-game";
import { ReadingGame } from "./reading-game";
import { CardsGame } from "./cards-game";
import { StoriesGamePage } from "./stories-game";
import { MathGame } from "./math-game";
import { JumpingFrogsGame } from "./jumping-frogs-game";
import { CocktailGame } from "./cocktail-game";
import { CarsGame } from "./cars-game";
import type { PreschoolGameId } from "./game-choice";
import { usePreschoolGamesGuard } from "./game-shell";
import { GamePageContainer } from "./kit/game-page-container";
import { HomeButton } from "./kit/home-button";
import { GameMusic } from "./kit/game-music-config";

// Full-screen player for one preschool minigame at its own URL
// (/games/balloons, /games/trains, /games/syllables (game id still
// "reading" internally), /games/syllables2 (game id still "cards"
// internally — see games-page.tsx's GAME_PATH_SEGMENT), /games/stories[/
// <storySlug>] — see games-page.tsx for the picker that links here).
// Trains fills the screen edge-to-edge; the others are capped and
// centered on wide screens (xl:max-w-*, same "don't cap below xl"
// convention as components/page-container.tsx) so they don't spread
// across an ultrawide monitor into an unplayably wide area.
//
// `storySlug` is only meaningful for game === "stories" — set when this is
// reached via /games/stories/[storySlug]/page.tsx, so a specific story
// opens directly (and stays open across a reload, since it's part of the
// URL rather than component state — see stories-game.tsx's StoriesGamePage).
export function GamePlayPage({
  game,
  storySlug,
}: {
  game: PreschoolGameId;
  storySlug?: string;
}) {
  const t = useTranslations("PreschoolChrome");
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
      ) : game === "math" ? (
        <MathGame />
      ) : game === "jumping-frogs" ? (
        <div className="mx-auto flex w-full flex-1 flex-col p-2 xl:max-w-5xl sm:p-4">
          <JumpingFrogsGame />
        </div>
      ) : game === "cocktail" ? (
        <div className="mx-auto flex w-full flex-1 flex-col p-2 xl:max-w-5xl sm:p-4">
          <CocktailGame />
        </div>
      ) : game === "cars" ? (
        <div className="mx-auto flex w-full flex-1 flex-col p-2 xl:max-w-5xl sm:p-4">
          <CarsGame />
        </div>
      ) : (
        <TrainsGame />
      )}
      {/* Every game's 🏠 goes back to the picker it was opened from — except the
          stories, which the dashboard opens directly (its "Казки" card), so
          there the 🏠 goes back to the dashboard. */}
      {game === "stories" ? (
        <HomeButton href="/" label={t("homeLabel")} />
      ) : (
        <HomeButton href="/games" />
      )}
      {/* Background music + its 🎵 settings, top-right — the same for every game. */}
      <GameMusic />
    </GamePageContainer>
  );
}

// A dedicated, DB-only variant of the "Казки" story player at /games/
// storybook[/<storySlug>] (see app/[locale]/(student)/games/storybook/
// page.tsx) — reuses everything GamePlayPage's game === "stories" branch
// does (same StoriesGamePage, guard, chrome), just with `dbOnly` so the
// picker and direct-slug navigation only ever show tutor-authored DB
// stories, never the static public/static/stories/ folk-tale set. Not a
// PreschoolGameId (doesn't appear in the /games picker grid — see
// game-choice.tsx's GAME_CATALOG) since it's a filtered view of "stories",
// not a separate minigame.
export function StorybookGamePage({ storySlug }: { storySlug?: string }) {
  const t = useTranslations("PreschoolChrome");
  const allowed = usePreschoolGamesGuard();

  if (!allowed) {
    return null;
  }

  return (
    <GamePageContainer>
      <div className="mx-auto flex w-full flex-1 flex-col p-2 xl:max-w-5xl sm:p-4">
        <StoriesGamePage
          slug={storySlug ?? null}
          basePath="/games/storybook"
          dbOnly
        />
      </div>
      <HomeButton href="/" label={t("homeLabel")} />
      <GameMusic />
    </GamePageContainer>
  );
}
