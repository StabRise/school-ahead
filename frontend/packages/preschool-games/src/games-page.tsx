"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { GamePicker, type PreschoolGameId } from "./game-choice";
import { usePreschoolGamesGuard } from "./game-shell";
import { GamePageContainer } from "./kit/game-page-container";

// Standalone entry point to the preschool minigames (Header's "Games" nav
// item), reachable at any time instead of only once today's lessons are
// done. Each card navigates to its own URL (/games/balloons, /games/trains
// — see game-play-page.tsx) rather than swapping local state, so a game is
// directly linkable/bookmarkable and the browser back button returns here.
// Preschool-only — a non-preschool student or a tutor bookmarking /games
// gets bounced home.
export function PreschoolGamesPage() {
  const t = useTranslations("GamesPage");
  const allowed = usePreschoolGamesGuard();
  const router = useRouter();

  if (!allowed) {
    return null;
  }

  return (
    <GamePageContainer>
      <GamePicker
        title={t("title")}
        subtitle={t("subtitle")}
        onSelect={(game: PreschoolGameId) => router.push(`/games/${game}`)}
      />
    </GamePageContainer>
  );
}
