"use client";

import { useTranslations } from "next-intl";

// Reflects Subject.is_filled (toggled from the tutor's Subject detail page)
// — shown wherever a subject is listed for a tutor (their subjects grid,
// a class's subject list). Renders nothing when unset, so an unfilled
// subject isn't visually flagged as a problem, just unmarked.
export function IsFilledBadge({ isFilled }: { isFilled: boolean }) {
  const t = useTranslations("SubjectDetail");

  if (!isFilled) return null;

  return <span className="shrink-0 text-xs text-gray-500">{t("isFilledBadge")}</span>;
}
