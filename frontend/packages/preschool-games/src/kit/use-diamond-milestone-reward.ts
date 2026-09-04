import { useEffect, useRef } from "react";
import { useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { getMeQueryKey } from "@school-ahead/api-client/browser/auth/auth";
import { mapApiUserToAuthUser, useAuthStore } from "@school-ahead/api-client";
import type { MeOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { useDiamondRewardStore } from "@school-ahead/preschool-ui";

type RewardMutation = UseMutationResult<MeOut, unknown, void, unknown>;

interface OriginRef {
  current: { getBoundingClientRect(): DOMRect } | null;
}

// Every preschool minigame converts some in-game currency into Diamonds at a
// milestone — see docs/core/gamification.md. Two shapes exist today:
//   - "count": every `threshold` collected items (rubies/letters/stars/...)
//     -> 1 Diamond, repeatable all game long (Balloons, Trains, Stories, Cards).
//   - "level": clearing a level -> 1 Diamond, once per mount (Reading, and
//     any future game that rewards this way).
type MilestoneConfig =
  | { mode: "count"; count: number; threshold: number; rewardMutation: RewardMutation; originRef: OriginRef; onMilestone?: () => void }
  | { mode: "level"; complete: boolean; rewardMutation: RewardMutation; originRef: OriginRef; onMilestone?: () => void };

// Centralizes the award boilerplate that used to be re-implemented per game
// (dedupe ref, badge-rect lookup, addDiamondFlight, reward mutation,
// setUser+invalidateQueries on success). `onMilestone` (a celebratory sound,
// say) fires for every visitor the instant a milestone is reached — the
// actual Diamond flight + server award only fire for a signed-in student,
// since an anonymous visitor (see middleware.ts's public /games) has no
// Diamond balance to animate or award to.
export function useDiamondMilestoneReward(config: MilestoneConfig): void {
  const countAwardedRef = useRef<Set<number>>(new Set());
  const levelAwardedRef = useRef(false);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const addDiamondFlight = useDiamondRewardStore((s) => s.addFlight);
  const queryClient = useQueryClient();

  const reached = config.mode === "count" ? config.count > 0 && config.count % config.threshold === 0 : config.complete;
  const dedupeKey = config.mode === "count" ? config.count : null;

  useEffect(() => {
    if (!reached) return;
    if (config.mode === "count") {
      if (dedupeKey === null || countAwardedRef.current.has(dedupeKey)) return;
      countAwardedRef.current.add(dedupeKey);
    } else {
      if (levelAwardedRef.current) return;
      levelAwardedRef.current = true;
    }

    config.onMilestone?.();
    if (!user) return;

    const rect = config.originRef.current?.getBoundingClientRect();
    const from = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    addDiamondFlight(from);

    config.rewardMutation.mutate(undefined, {
      onSuccess: (response) => {
        setUser(mapApiUserToAuthUser(response.user));
        queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
      },
    });
    // rewardMutation/setUser/queryClient/addDiamondFlight/onMilestone are
    // stable across renders; only re-run when the milestone is actually hit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reached, dedupeKey, user]);
}
