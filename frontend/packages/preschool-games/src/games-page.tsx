"use client";

import { useTranslations } from "next-intl";
import { GamePicker, type PreschoolGameId } from "./game-choice";
import { usePreschoolGamesGuard } from "./game-shell";
import { GamePageContainer } from "./kit/game-page-container";
import { useLocaleAwareGamesRouter } from "./kit/use-locale-aware-router";

// Standalone entry point to the preschool minigames (Header's "Games" nav
// item), reachable at any time instead of only once today's lessons are
// done. Each card navigates to its own URL (/games/balloons, /games/trains
// — see game-play-page.tsx) rather than swapping local state, so a game is
// directly linkable/bookmarkable and the browser back button returns here.
// Open to every student regardless of interfaceMode (not preschool-only) —
// only a tutor bookmarking /games gets bounced home, see
// usePreschoolGamesGuard.

// The "cards" game id (CardsGame, useCardsGameStore, /api/cards-game-mode*,
// etc.) predates this URL and stays as-is internally — only its route
// segment was renamed to /games/reading-cards, so it needs a lookup instead
// of the id doubling as the URL segment like every other game.
const GAME_PATH_SEGMENT: Record<PreschoolGameId, string> = {
  balloons: "balloons",
  trains: "trains",
  reading: "reading",
  cards: "reading-cards",
  stories: "stories",
  math: "math",
};

export function PreschoolGamesPage() {
  const t = useTranslations("GamesPage");
  const allowed = usePreschoolGamesGuard();
  const router = useLocaleAwareGamesRouter();

  if (!allowed) {
    return null;
  }

  return (
    <GamePageContainer>
      <GamePicker
        title={t("title")}
        subtitle={t("subtitle")}
        onSelect={(game: PreschoolGameId) => router.push(`/games/${GAME_PATH_SEGMENT[game]}`)}
      />
    </GamePageContainer>
  );
}
