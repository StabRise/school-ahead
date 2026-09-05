"use client";

import { useEffect } from "react";
import { useAuthStore } from "@school-ahead/api-client";
import { useLocaleAwareGamesRouter } from "./kit/use-locale-aware-router";

// Shared "students (and signed-out visitors) only" guard for every
// /games* route (games-page.tsx, game-play-page.tsx) — a tutor bookmarking
// any of them gets bounced home. Available regardless of interfaceMode
// ("default"/"simple"/"preschool") — see the header's "Games" link
// (components/header.tsx) and main-menu.tsx's comment, both of which show
// it to every student, not just preschool ones. `role` is momentarily
// unknown right after load, so this optimistically returns true (render)
// until it resolves, same as the original single-page guard it replaces.
export function usePreschoolGamesGuard(): boolean {
  const role = useAuthStore((state) => state.user?.role);
  const router = useLocaleAwareGamesRouter();
  const blocked = Boolean(role) && role !== "student";

  useEffect(() => {
    if (blocked) router.replace("/");
    // router is a fresh object every render (useLocaleAwareGamesRouter isn't
    // memoized) — keying off `blocked` alone avoids re-firing the redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  return !blocked;
}
