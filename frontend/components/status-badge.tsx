"use client";

import { useTranslations } from "next-intl";

const STATUS_LABEL_KEY: Record<string, string> = {
  assigned: "statusAssigned",
  in_progress: "statusInProgress",
  need_help: "statusNeedHelp",
  pending_review: "statusPendingReview",
  revision_required: "statusRevisionRequired",
  completed: "statusCompleted",
};

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("LessonStatus");
  const key = STATUS_LABEL_KEY[status] ?? "statusAssigned";
  return (
    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
      {t(key)}
    </span>
  );
}
