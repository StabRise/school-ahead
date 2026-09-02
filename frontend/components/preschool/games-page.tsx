"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { GamePicker, type PreschoolGameId } from "@/components/preschool/game-choice";
import { usePreschoolGamesGuard } from "@/components/preschool/game-shell";

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
    <div className="relative flex flex-1 flex-col bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
      <GamePicker
        title={t("title")}
        subtitle={t("subtitle")}
        onSelect={(game: PreschoolGameId) => router.push(`/games/${game}`)}
      />
    </div>
  );
}
