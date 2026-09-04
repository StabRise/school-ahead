"use client";

import { useTranslations } from "next-intl";

// Score always renders in the lesson header (docs/interfaces/student/lesson.md),
// even before grading — a dash placeholder keeps the header layout stable.
export function ScoreBadge({
  gradePoints,
  gradeResult,
}: {
  gradePoints: number | null;
  gradeResult: string | null;
}) {
  const t = useTranslations("LessonWizard");

  const label = (() => {
    if (gradePoints !== null) return t("scoreValue", { points: gradePoints });
    if (gradeResult === "pass") return t("scorePass");
    if (gradeResult === "fail") return t("scoreFail");
    return t("scoreNotGraded");
  })();

  const colorClasses =
    gradeResult === "fail"
      ? "bg-red-100 text-red-700"
      : gradePoints !== null || gradeResult === "pass"
        ? "bg-green-100 text-green-700"
        : "bg-gray-100 text-gray-500";

  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${colorClasses}`}>
      {label}
    </span>
  );
}
