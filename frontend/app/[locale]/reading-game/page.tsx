import { StoriesGame } from "@/components/preschool/stories-game";

// Public, no-login mirror of the "Казки" minigame (normally only reachable
// as a preschool student at /games/stories, guarded by
// usePreschoolGamesGuard — see components/preschool/game-play-page.tsx) so
// it can be shared with anyone. Deliberately outside the `(student)` route
// group (no guard, no session-dependent chrome like the "back to /games"
// switch-game link, which itself requires a session) and listed in
// middleware.ts's PUBLIC_PATHS so the access_token cookie check is skipped
// for it. Uses StoriesGame (local-state picker/story switch, same as the
// post-lesson celebration overlay) rather than the routed StoriesGamePage,
// since a per-story URL isn't needed for an anonymous share link.
export default function PublicReadingGamePage() {
  return (
    <div className="relative flex flex-1 flex-col bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
      <div className="mx-auto flex w-full flex-1 flex-col p-2 xl:max-w-5xl sm:p-4">
        <StoriesGame />
      </div>
    </div>
  );
}
