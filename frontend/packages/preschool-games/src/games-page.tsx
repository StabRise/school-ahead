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

// The "cards" and "reading" game ids (CardsGame/useCardsGameStore/
// /api/cards-game-mode* and ReadingGame respectively) predate their URLs
// and stay as-is internally — only their route segments were renamed (to
// /games/syllables2 and /games/syllables), so each needs a lookup instead
// of the id doubling as the URL segment like every other game.
// "flashcards" is the unrelated subject study-cards library
// (FlashcardsGroupsPage), which actually owns the plain /games/cards
// segment — see game-choice.tsx's own GAME_CATEGORIES comment for how the
// two "cards" names split apart.
const GAME_PATH_SEGMENT: Record<PreschoolGameId, string> = {
  balloons: "balloons",
  trains: "trains",
  reading: "syllables",
  cards: "syllables2",
  stories: "stories",
  math: "math",
  "jumping-frogs": "jumping-frogs",
  cocktail: "cocktail",
  cars: "cars",
  flashcards: "cards",
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
        onSelect={(game: PreschoolGameId) => router.push(`/games/${GAME_PATH_SEGMENT[game]}`)}
      />
    </GamePageContainer>
  );
}
