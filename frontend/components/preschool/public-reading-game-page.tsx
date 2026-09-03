"use client";

import { StoriesGamePage } from "@/components/preschool/stories-game";

// Public, no-login mirror of the "Казки" minigame (normally only reachable
// as a preschool student at /games/stories[/<storySlug>], guarded by
// usePreschoolGamesGuard — see components/preschool/game-play-page.tsx) so
// it, and each individual story, can be shared with anyone by a plain URL.
// Mounted at /reading-game[/<storySlug>] (see app/[locale]/reading-game/
// page.tsx and .../[storySlug]/page.tsx), both listed in middleware.ts's
// PUBLIC_PATHS so the access_token cookie check is skipped for them.
// Deliberately outside the `(student)` route group (no guard, no
// session-dependent chrome like GamePlayPage's "back to /games" link, which
// itself requires a session) — this is StoriesGamePage's own gradient
// background instead of GamePlayPage's, since nothing else here needs
// GamePlayPage's game-switcher chrome.
export function PublicReadingGamePage({ storySlug }: { storySlug?: string }) {
  return (
    <div className="relative flex flex-1 flex-col bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
      <div className="mx-auto flex w-full flex-1 flex-col p-2 xl:max-w-5xl sm:p-4">
        <StoriesGamePage slug={storySlug ?? null} basePath="/reading-game" />
      </div>
    </div>
  );
}
