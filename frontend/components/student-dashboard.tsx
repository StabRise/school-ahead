"use client";

import { useTranslations } from "next-intl";
import { useGetToday } from "@/lib/api/browser/schedule/schedule";
import type { CalendarItemOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

// Local (not UTC) YYYY-MM-DD — avoids toISOString() shifting the date near
// midnight in timezones behind UTC.
function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const STATUS_LABEL_KEY: Record<string, string> = {
  assigned: "statusAssigned",
  in_progress: "statusInProgress",
  need_help: "statusNeedHelp",
  pending_review: "statusPendingReview",
  revision_required: "statusRevisionRequired",
  completed: "statusCompleted",
};

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("StudentDashboard");
  const key = STATUS_LABEL_KEY[status] ?? "statusAssigned";
  return (
    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
      {t(key)}
    </span>
  );
}

function LessonRow({ item }: { item: CalendarItemOut }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-md border border-gray-200 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{item.lesson_title}</p>
        <p className="truncate text-sm text-gray-500">{item.subject_name}</p>
      </div>
      <StatusBadge status={item.status} />
    </li>
  );
}

export function StudentDashboard() {
  const t = useTranslations("StudentDashboard");
  const { data, isLoading, isError } = useGetToday({ date: toLocalIsoDate(new Date()) });

  const lessons = data?.today ?? [];

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <h2 className="mb-4 text-xl font-semibold">{t("title")}</h2>

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
    </div>
  );
}
