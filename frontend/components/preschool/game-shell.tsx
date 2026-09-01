"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "@/i18n/navigation";

// Shared "preschool student only" guard for every /games* route
// (games-page.tsx, game-play-page.tsx) — a non-preschool student or a
// tutor bookmarking any of them gets bounced home. `role` is momentarily
// unknown right after load, so this optimistically returns true (render)
// until it resolves, same as the original single-page guard it replaces.
export function usePreschoolGamesGuard(): boolean {
  const role = useAuthStore((state) => state.user?.role);
  const isPreschool = useAuthStore((state) => state.user?.interfaceMode === "preschool");
  const router = useRouter();
  const blocked = Boolean(role) && (role !== "student" || !isPreschool);

  useEffect(() => {
    if (blocked) router.replace("/");
  }, [blocked, router]);

  return !blocked;
}
