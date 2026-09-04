"use client";

import { useTranslations } from "next-intl";
import type { BacklogItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { LessonBubble } from "./lesson-bubble";

// origin_label is a plain ISO date (see scheduling.services.backlog_label),
// formatted here for display — same short shape as the calendar's
// RANGE_DAY_FORMAT (components/calendar/simple-calendar.tsx).
const ORIGIN_DATE_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });

// "Хвостики" — overdue lessons, shown the same way on both the calendar and
// "My Today's Lessons" pages so a child never loses track of unfinished
// work. See docs/interfaces/preschool.md.
export function PreschoolBacklogSection({ items }: { items: BacklogItemOut[] }) {
  const t = useTranslations("PreschoolBacklog");

  if (items.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-2">
      <h2 className="text-center text-lg font-extrabold text-amber-800">{t("title")}</h2>
      <p className="-mt-1 text-center text-xs text-amber-800/80">{t("hint")}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-white/90 p-3 shadow-md">
            <LessonBubble item={item} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gray-800">{item.lesson_title}</p>
              <p className="truncate text-xs text-amber-700">
                {t("origin", { label: ORIGIN_DATE_FORMAT.format(new Date(`${item.origin_label}T00:00:00`)) })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
