"use client";

import { useTranslations } from "next-intl";

export const STATUS_LABEL_KEY: Record<string, string> = {
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

// `small` shrinks padding/font for dense contexts (the Default dashboard's
// table) — other call sites are unaffected since it defaults to off.
export function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const t = useTranslations("LessonStatus");
  const key = STATUS_LABEL_KEY[status] ?? "statusAssigned";
  const colorClasses = STATUS_COLOR_CLASSES[status] ?? STATUS_COLOR_CLASSES.assigned;
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded-full font-medium ${colorClasses} ${
        small ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs"
      }`}
    >
      {t(key)}
    </span>
  );
}
