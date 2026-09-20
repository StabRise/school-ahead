"use client";

import { useEffect, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuthStore, useIsPreschoolStudent } from "@school-ahead/api-client";
import { useGetToday } from "@school-ahead/api-client/browser/schedule/schedule";
import { PreschoolButton, PreschoolGameMap } from "@school-ahead/preschool-ui";
import { PreschoolCelebration } from "@school-ahead/preschool-games";
import { useDialogs } from "@/components/dialogs/app-dialogs";
import { useRouter } from "@/i18n/navigation";
import { todayIso } from "@/lib/dates";
import { sortLessonItems } from "@/lib/lesson-order";

// Lesson statuses that no longer block the preschool minigame — the
// student's own part is done (Completed) or the ball is in someone else's
// court (Pending Review, Need Help). Assigned, In Progress, and Revision
// Required all mean there's still something for the student to do, so they
// keep the game locked.
const READY_FOR_GAME_STATUSES = ["completed", "pending_review", "need_help"];

// "My lessons" (`/lessons`) — the adventure road of overdue "tails" and
// today's lessons, or, once all of them are done, the celebration minigames.
// It used to be the preschool dashboard at `/`; the dashboard is now a hub of
// big cards (components/preschool/dashboard.tsx) and this is one of them. See
// docs/views/preschool/README.md.
//
// Only for a student in preschool mode: anyone else has their own dashboard at
// `/`, so they are sent there.
export function PreschoolLessonsRoad() {
  const t = useTranslations("StudentDashboard");
  const tChrome = useTranslations("PreschoolChrome");
  const locale = useLocale();
  const router = useRouter();
  const isResolved = useAuthStore((state) => state.isResolved);
  const user = useAuthStore((state) => state.user);
  const isPreschool = useIsPreschoolStudent();
  const { data, isLoading, isError, refetch } = useGetToday({ date: todayIso() }, { query: { enabled: isPreschool } });

  const dialogs = useDialogs();
  // The road's minus button asks and reports through the app's dialogs; a
  // step is only ever removed, so a question there is always a "danger" one.
  const mapDialogs = useMemo(
    () => ({
      confirm: (message: string) => dialogs.confirm({ message, tone: "danger" }),
      error: (message: string) => dialogs.error(message),
    }),
    [dialogs],
  );

  const lessons = useMemo(() => sortLessonItems(data?.today ?? []), [data?.today]);
  const backlog = useMemo(() => sortLessonItems(data?.backlog ?? []), [data?.backlog]);

  useEffect(() => {
    if (isResolved && user && !isPreschool) router.replace("/");
  }, [isResolved, user, isPreschool, router]);

  if (!isPreschool) return null;

  // The road walks through overdue "tails" first, then today's lessons — one
  // continuous path instead of a separate list.
  const roadItems = [...backlog, ...lessons];

  // Trigger condition evaluated on load — unlocks once every tail and every
  // one of today's lessons is at a READY_FOR_GAME status, not just today's.
  // `.every()` is vacuously true on an empty array, so a day (and backlog)
  // with no lessons at all unlocks the game too.
  const canPlayGame =
    backlog.every((item) => READY_FOR_GAME_STATUSES.includes(item.status)) &&
    lessons.every((item) => READY_FOR_GAME_STATUSES.includes(item.status));

  // Full-bleed gradient — fills the whole viewport, not just a boxed card,
  // matching the "adventure map" theme.
  return (
    <div className="relative flex flex-1 flex-col bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
      {!isLoading && !isError && canPlayGame ? (
        // The celebration minigames want the full screen width to play in — no
        // side margins, unlike the boxed max-w-5xl content below. They bring
        // their own 🏠 (and it goes to the dashboard).
        <PreschoolCelebration />
      ) : (
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-6">
          {/* Fixed in the corner, out of the layout, so the heading stays at the
              top. PreschoolButton links with next/link, which knows nothing
              about the locale, so the href carries it explicitly. */}
          <PreschoolButton
            href={`/${locale}`}
            icon="🏠"
            label={tChrome("homeLabel")}
            ringColorClassName="ring-emerald-400"
            position="top-left"
          />
          {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
          {isError && <p className="text-sm text-red-600">{t("error")}</p>}
          {/* No separate backlog section here — tails are already walked into
              `roadItems` above, so listing them again would just duplicate
              what's on the road. */}
          {!isLoading && !isError && (
            <PreschoolGameMap items={roadItems} dialogs={mapDialogs} onLessonCancelled={() => refetch()} />
          )}
        </div>
      )}
    </div>
  );
}
