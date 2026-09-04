import type { ReactNode } from "react";

// The full-bleed gradient shell every top-level games screen sits in —
// replaces the identical wrapper that used to be hand-copied into
// games-page.tsx, game-play-page.tsx, and the old public-reading-game-page.tsx.
export function GamePageContainer({ children }: { children: ReactNode }) {
  return <div className="relative flex flex-1 flex-col bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">{children}</div>;
}
