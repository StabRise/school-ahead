"use client";

import { useTranslations } from "next-intl";
import { BadgeCheck } from "lucide-react";

// Reflects Subject.is_filled (toggled from the tutor's Subject detail page)
// — shown wherever a subject is listed or titled for a tutor (their
// subjects grid, a class's subject list, the subject detail page's own
// title). Renders nothing when unset, so an unfilled subject isn't
// visually flagged as a problem, just unmarked.
export function IsFilledBadge({ isFilled }: { isFilled: boolean }) {
  const t = useTranslations("SubjectDetail");

  if (!isFilled) return null;

  return (
    <span
      title={t("isFilledBadge")}
      aria-label={t("isFilledBadge")}
      className="inline-flex w-fit shrink-0 items-center rounded-full bg-green-100 p-1 text-green-700"
    >
      <BadgeCheck className="size-3" aria-hidden="true" />
    </span>
  );
}
