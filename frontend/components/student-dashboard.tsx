"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useGetToday } from "@/lib/api/browser/schedule/schedule";
import { sortLessonItems } from "@/lib/lesson-order";
import { PreschoolGameMap } from "@/components/preschool/game-map";
import { PreschoolCelebration } from "@/components/preschool/game-choice";
import { SimpleDashboard } from "@/components/simple-dashboard";
import { SimplePageContainer } from "@/components/simple/page-container";
import { useAuthStore } from "@/stores/auth-store";

// Lesson statuses that no longer block the preschool minigame — the
// student's own part is done (Completed) or the ball is in someone else's
// court (Pending Review, Need Help). Assigned, In Progress, and Revision
// Required all mean there's still something for the student to do, so they
// keep the game locked.
const READY_FOR_GAME_STATUSES = ["completed", "pending_review", "need_help"];

// Local (not UTC) YYYY-MM-DD — avoids toISOString() shifting the date near
// midnight in timezones behind UTC.
function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Default and Simple are now the same dashboard (SimpleDashboard's dense
// table + collapsible stats section) — Default just turns `colorful` on to
// get back its colored status badges, dark-red overdue dates, blue
// histogram, and gradient progress bars. Preschool stays its own thing.
export function StudentDashboard() {
  const t = useTranslations("StudentDashboard");
  const interfaceMode = useAuthStore((state) => state.user?.interfaceMode);
  const isPreschool = interfaceMode === "preschool";
  const isSimple = interfaceMode === "simple";
  const { data, isLoading, isError } = useGetToday({ date: toLocalIsoDate(new Date()) });

  const lessons = useMemo(() => sortLessonItems(data?.today ?? []), [data?.today]);
  const backlog = useMemo(() => sortLessonItems(data?.backlog ?? []), [data?.backlog]);

  if (isPreschool) {
    // The road walks through overdue "tails" first, then today's lessons —
    // one continuous path instead of a separate list. See
    // docs/views/preschool/README.md.
    const roadItems = [...backlog, ...lessons];

    // Trigger condition evaluated on dashboard load — unlocks once every
    // tail and every one of today's lessons is at a READY_FOR_GAME status,
    // not just today's. `.every()` is vacuously true on an empty array, so
    // a day (and backlog) with no lessons at all unlocks the game too. See
    // docs/views/preschool/README.md.
    const canPlayGame =
      backlog.every((item) => READY_FOR_GAME_STATUSES.includes(item.status)) &&
      lessons.every((item) => READY_FOR_GAME_STATUSES.includes(item.status));

    // Full-bleed gradient — fills the whole viewport below the header, not
    // just a boxed card, matching the "adventure map" theme.
    return (
      <div className="relative flex flex-1 flex-col bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
        {!isLoading && !isError && canPlayGame ? (
          // The celebration minigames want the full screen width to play
          // in — no side margins, unlike the boxed max-w-5xl content below.
          <PreschoolCelebration />
        ) : (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-6">
            {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
            {isError && <p className="text-sm text-red-600">{t("error")}</p>}
            {/* No separate backlog section here — tails are already walked
                into `roadItems` above, so listing them again would just
                duplicate what's on the road. See docs/views/preschool/README.md. */}
            {!isLoading && !isError && <PreschoolGameMap items={roadItems} />}
          </div>
        )}
      </div>
    );
  }

  return (
    <SimplePageContainer title={t("title")}>
      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}
      {!isLoading && !isError && (
        <SimpleDashboard lessons={data?.today ?? []} backlog={data?.backlog ?? []} colorful={!isSimple} />
      )}
    </SimplePageContainer>
  );
}
