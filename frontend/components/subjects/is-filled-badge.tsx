"use client";

import { useTranslations } from "next-intl";

// Reflects Subject.is_filled (toggled from the tutor's Subject detail page)
// — shown wherever a subject is listed for a tutor (their subjects grid,
// a class's subject list). Renders nothing when unset, so an unfilled
// subject isn't visually flagged as a problem, just unmarked.
export function IsFilledBadge({ isFilled }: { isFilled: boolean }) {
  const t = useTranslations("SubjectDetail");

  if (!isFilled) return null;

  return (
    <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      ✅ {t("isFilledBadge")}
    </span>
  );
}
