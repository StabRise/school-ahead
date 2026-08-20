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

const STATUS_COLOR_CLASSES: Record<string, string> = {
  assigned: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  need_help: "bg-amber-100 text-amber-800",
  pending_review: "bg-purple-100 text-purple-700",
  revision_required: "bg-red-100 text-red-700",
  completed: "bg-green-100 text-green-700",
};

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("LessonStatus");
  const key = STATUS_LABEL_KEY[status] ?? "statusAssigned";
  const colorClasses = STATUS_COLOR_CLASSES[status] ?? STATUS_COLOR_CLASSES.assigned;
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${colorClasses}`}>
      {t(key)}
    </span>
  );
}
