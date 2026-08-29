"use client";

import { useTranslations } from "next-intl";
import { BookOpen } from "lucide-react";
import { useGetToday } from "@/lib/api/browser/schedule/schedule";
import { useListMyAchievements } from "@/lib/api/browser/achievements/achievements";
import type { CalendarItemOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { StatusBadge } from "@/components/status-badge";
import { GradeSquareBadge } from "@/components/grade-square-badge";
import { Card } from "@/components/card";
import { PageContainer } from "@/components/page-container";
import { ProgressBar } from "@/components/progress-bar";
import { PreschoolGameMap } from "@/components/preschool/game-map";
import { PreschoolCelebration } from "@/components/preschool/game-choice";
import { DefaultStepIcon } from "@/components/preschool/decorations";
import { ContentTypeBadges } from "@/components/subjects/content-type-badges";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "@/i18n/navigation";

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

// task_content is markdown/HTML — strip it down to a short plain-text
// preview rather than rendering it in full (the full task is shown on the
// lesson wizard's submission step). See NextLessonCard's identical helper.
function homeworkPreview(taskContent: string, maxLength = 140): string {
  const plain = taskContent
    .replace(/<[^>]+>/g, " ")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[#*_`>~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength)}…` : plain;
}

// Mirrors LessonBubble's round subject/lesson icon (see
// components/preschool/lesson-bubble.tsx) but as a plain div — the row
// itself is already the clickable link, so the icon can't be a nested one.
function LessonIcon({ item }: { item: CalendarItemOut }) {
  const isCompleted = item.status === "completed";
  const src = item.lesson_icon ?? item.subject_icon;

  return (
    <div
      className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white bg-white shadow-sm ${
        isCompleted ? "opacity-60 grayscale" : ""
      }`}
    >
      <div className="h-9 w-9 overflow-hidden rounded-full">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <DefaultStepIcon />
        )}
      </div>
    </div>
  );
}

// dateLabel is the backlog's origin-day label (e.g. "Пн #4" — see
// services.backlog_label) for a "tail" lesson shown outside its original
// day; omitted for today's own lessons, which need no such context.
function LessonRow({ item, dateLabel }: { item: CalendarItemOut; dateLabel?: string }) {
  const tCalendar = useTranslations("Calendar");
  const tDashboard = useTranslations("StudentDashboard");
  const router = useRouter();
  const homework = item.lesson_type === "with_task" && item.task_content ? homeworkPreview(item.task_content) : null;

  return (
    <li>
      <Card
        href={`/lessons/${item.id}`}
        className="flex flex-col gap-2 border-l-4"
        style={{ borderLeftColor: item.subject_color ?? "#D1D5DB" }}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <LessonIcon item={item} />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-gray-900">{item.subject_name}</p>
              <p className="truncate font-medium">{item.lesson_title}</p>
              <p className="line-clamp-2 text-xs text-gray-500">{item.topic_title}</p>
              {dateLabel && (
                <p className="truncate text-xs text-amber-700">
                  {tDashboard("backlogOrigin", { label: dateLabel })}
                </p>
              )}
            </div>
          </div>
          {homework && (
            <p className="min-w-0 border-l-2 border-gray-200 pl-2 text-sm text-gray-600 sm:max-w-xs sm:shrink-0">
              📌 {homework}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
          <div className="flex min-w-0 items-center gap-2">
            <ContentTypeBadges lessonType={item.lesson_type} />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/subjects/${item.subject_id}`);
              }}
              title={tCalendar("viewSubject")}
              aria-label={tCalendar("viewSubject")}
              className="shrink-0 rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <BookOpen className="h-4 w-4" />
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <GradeSquareBadge
              gradePoints={item.grade_points}
              gradeResult={item.grade_result}
              sizeClassName="h-6 w-6"
              compact
            />
            <StatusBadge status={item.status} />
          </div>
        </div>
      </Card>
    </li>
  );
}

// Right-hand rail on the default (non-preschool) dashboard — reuses the
// same "Мої досягнення" per-subject completion data (achievements.services)
// as the achievements page, just rendered as compact bars instead of cards.
// Renders nothing while loading/erroring/empty so it never pushes the
// lesson list around with a placeholder.
function SubjectStatsSidebar() {
  const t = useTranslations("StudentDashboard");
  const { data } = useListMyAchievements();
  const subjects = data ?? [];

  if (subjects.length === 0) {
    return null;
  }

  return (
    <aside className="w-full shrink-0 lg:w-72 xl:w-80">
      <div className="flex flex-col gap-4 rounded-md border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900">{t("statsTitle")}</h3>
        <ul className="flex flex-col gap-3">
          {subjects.map((subject) => (
            <li key={subject.subject_id}>
              <ProgressBar percent={subject.completed_percent} label={subject.subject_name} />
            </li>
          ))}
        </ul>
      </div>
    </aside>
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
    <PageContainer title={t("title")} maxWidthClassName="xl:max-w-7xl">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
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
                  <LessonRow key={item.id} item={item} dateLabel={item.origin_label} />
                ))}
              </ul>
            </div>
          )}
        </div>

        <SubjectStatsSidebar />
      </div>
    </PageContainer>
  );
}
