"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey } from "@/lib/api/browser/auth/auth";
import { useConfirmUnderstanding } from "@/lib/api/browser/student-lessons/student-lessons";
import { useAuthStore } from "@/stores/auth-store";
import { useDiamondRewardStore } from "@/stores/diamond-reward-store";

export function TheoryStep({
  studentLessonId,
  onChanged,
}: {
  studentLessonId: number;
  onChanged: () => void;
}) {
  const t = useTranslations("TheoryStep");
  const confirmUnderstanding = useConfirmUnderstanding();
  const addDiamondFlight = useDiamondRewardStore((s) => s.addFlight);
  const addDiamonds = useAuthStore((s) => s.addDiamonds);
  const queryClient = useQueryClient();

  const confirm = (understood: boolean) => {
    confirmUnderstanding.mutate(
      { studentLessonId, data: { understood } },
      {
        onSuccess: (result) => {
          if (result.diamonds_awarded > 0) {
            // No natural "from" point for a completion happening off a
            // plain button click (unlike the balloon game's score badge)
            // — flies from screen-center, the same fallback the balloon
            // game itself uses when it has no rect to start from.
            addDiamondFlight(
              { x: window.innerWidth / 2, y: window.innerHeight / 2 },
              result.diamonds_awarded,
            );
            addDiamonds(result.diamonds_awarded);
            queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
          }
          onChanged();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg font-semibold">{t("question")}</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={confirmUnderstanding.isPending}
          onClick={() => confirm(true)}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("yesButton")}
        </button>
        <button
          type="button"
          disabled={confirmUnderstanding.isPending}
          onClick={() => confirm(false)}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          {t("noButton")}
        </button>
      </div>
    </div>
  );
}
