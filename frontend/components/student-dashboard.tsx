"use client";

import { useTranslations } from "next-intl";
import { useGetToday } from "@/lib/api/browser/schedule/schedule";
import type { BacklogItemOut, CalendarItemOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { StatusBadge } from "@/components/status-badge";
import { GradePoints } from "@/components/grade-points";
import { Card } from "@/components/card";
import { PageContainer } from "@/components/page-container";
import { PreschoolGameMap } from "@/components/preschool/game-map";
import { BalloonPopGame } from "@/components/preschool/balloon-pop-game";
import { useAuthStore } from "@/stores/auth-store";

// Local (not UTC) YYYY-MM-DD — avoids toISOString() shifting the date near
// midnight in timezones behind UTC.
function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function LessonRow({ item }: { item: CalendarItemOut }) {
  return (
    <li>
      <Card href={`/lessons/${item.id}`} className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.lesson_title}</p>
          <p className="truncate text-sm text-gray-500">{item.subject_name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {item.grade_points != null && <GradePoints points={item.grade_points} />}
          <StatusBadge status={item.status} />
        </div>
      </Card>
    </li>
  );
}

// "Tails" — lessons that passed their scheduled date without reaching
// Completed. See docs/interfaces/student/calendar.md ("Backlog Block") and
// today.md ("Backlog Section"): shown separately, with the original
// scheduled-day origin label (e.g. "Mon #4") preserved for context.
function BacklogRow({ item }: { item: BacklogItemOut }) {
  const t = useTranslations("StudentDashboard");

  return (
    <li>
      <Card href={`/lessons/${item.id}`} className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.lesson_title}</p>
          <p className="truncate text-sm text-gray-500">{item.subject_name}</p>
          <p className="truncate text-xs text-amber-700">
            {t("backlogOrigin", { label: item.origin_label })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {item.grade_points != null && <GradePoints points={item.grade_points} />}
          <StatusBadge status={item.status} />
        </div>
      </Card>
    </li>
  );
}

export function StudentDashboard() {
  const t = useTranslations("StudentDashboard");
  const isPreschool = useAuthStore((state) => state.user?.interfaceMode === "preschool");
  const { data, isLoading, isError } = useGetToday({ date: toLocalIsoDate(new Date()) });

  const lessons = data?.today ?? [];
  const backlog = data?.backlog ?? [];

  if (isPreschool) {
    // The road walks through overdue "tails" first, then today's lessons —
    // one continuous path instead of a separate list. See
    // docs/interfaces/preschool.md.
    const roadItems = [...backlog, ...lessons];

    // Trigger condition evaluated on dashboard load — only once every tail
    // is cleared too, not just today's lessons. See docs/interfaces/
    // preschool.md section 2.4.
    const hasAnyItems = lessons.length > 0 || backlog.length > 0;
    const allTodayCompleted =
      hasAnyItems && backlog.length === 0 && lessons.every((item) => item.status === "completed");

    // Full-bleed gradient — fills the whole viewport below the header, not
    // just a boxed card, matching the "adventure map" theme.
    return (
      <div className="relative flex flex-1 flex-col bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-6">
          {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
          {isError && <p className="text-sm text-red-600">{t("error")}</p>}
          {/* No separate backlog section here — tails are already walked
              into `roadItems` above, so listing them again would just
              duplicate what's on the road. See docs/interfaces/preschool.md. */}
          {!isLoading && !isError && (allTodayCompleted ? <BalloonPopGame /> : <PreschoolGameMap items={roadItems} />)}
        </div>
      </div>
    );
  }

  return (
    <PageContainer title={t("title")}>
      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {!isLoading && !isError && lessons.length === 0 && (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      )}

      {lessons.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lessons.map((item) => (
            <LessonRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {!isLoading && !isError && backlog.length > 0 && (
        <div className="mt-8 flex flex-col gap-2">
          <h3 className="text-lg font-semibold">{t("backlogTitle")}</h3>
          <p className="-mt-1 mb-1 text-sm text-gray-500">{t("backlogHint")}</p>
          <ul className="flex flex-col gap-2">
            {backlog.map((item) => (
              <BacklogRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}
    </PageContainer>
  );
}
