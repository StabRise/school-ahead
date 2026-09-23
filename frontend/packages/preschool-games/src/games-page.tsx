"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useListPreschoolGames } from "@school-ahead/api-client/browser/preschool/preschool";
import type { GameOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import {
  builtInGameForUrl,
  builtInGameVisual,
  GAME_URL,
  GameCard,
  GamePicker,
  GamePickerGrid,
} from "./game-choice";
import { usePreschoolGamesGuard } from "./game-shell";
import { GamePageContainer } from "./kit/game-page-container";
import { useLocaleAwareGamesRouter } from "./kit/use-locale-aware-router";

// Standalone entry point to the preschool minigames (Header's "Games" nav
// item), reachable at any time instead of only once today's lessons are
// done. The cards come from the DB (backend preschool.Game, grouped by
// GameCategory; inactive ones are left out). Each card navigates to its
// game's `url` (/games/balloons, /games/trains — see game-play-page.tsx)
// rather than swapping local state, so a game is
// directly linkable/bookmarkable and the browser back button returns here.
// Open to every student regardless of interfaceMode (not preschool-only) —
// only a tutor bookmarking /games gets bounced home, see
// usePreschoolGamesGuard.

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function UploadedGameIcon({ src }: { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      draggable={false}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

// A DB game's card cover: its uploaded icon (already a thumbnail, see
// backend's GameOut), else the built-in cover/SVG of the game its `url`
// points at, else its title's first letter.
function dbGameVisual(game: GameOut): { cover: ReactNode; accentRing: string } {
  const builtIn = builtInGameForUrl(game.url);
  const visual = builtIn ? builtInGameVisual(builtIn) : null;
  const accentRing = visual?.accentRing ?? "ring-gray-300";
  if (game.icon_url) {
    return {
      cover: <UploadedGameIcon src={game.icon_url} />,
      accentRing,
    };
  }
  if (visual) return visual;
  return {
    cover: (
      <div className="absolute inset-0 flex items-center justify-center bg-white text-4xl font-extrabold text-gray-400">
        {game.title.charAt(0).toUpperCase()}
      </div>
    ),
    accentRing,
  };
}

export function PreschoolGamesPage() {
  const t = useTranslations("GamesPage");
  const allowed = usePreschoolGamesGuard();
  const router = useLocaleAwareGamesRouter();
  // Active categories and games, in order — managed in the Django admin
  // (backend preschool.Game / GameCategory).
  const { data: categories, isError } = useListPreschoolGames({
    query: { enabled: allowed },
  });

  if (!allowed) {
    return null;
  }

  const open = (url: string) => {
    if (isExternalUrl(url)) window.location.assign(url);
    else router.push(url);
  };

  return (
    <GamePageContainer>
      {isError ? (
        // Backend unreachable — still let the child play the built-in games.
        <GamePicker
          title={t("title")}
          onSelect={(game) => open(GAME_URL[game])}
        />
      ) : categories ? (
        <GamePickerGrid
          title={t("title")}
          categories={categories.map((category) => ({
            key: String(category.id),
            title: category.name,
            cards: category.games.map((game) => (
              <GameCard
                key={game.id}
                title={game.title}
                {...dbGameVisual(game)}
                onSelect={() => open(game.url)}
              />
            )),
          }))}
        />
      ) : null}
    </GamePageContainer>
  );
}
