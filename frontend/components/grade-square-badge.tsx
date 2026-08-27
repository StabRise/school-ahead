"use client";

import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";

// Border/text color reflects the 12-point Ukrainian grading scale (a pass
// counts as the top tier, a fail as the bottom): 10-12 & pass -> purple,
// 7-9 -> blue, 4-6 -> orange, 0-3 & fail -> red.
function gradeColorClasses(gradePoints: number | null, gradeResult: string | null): string {
  // if (gradeResult === "pass") return "border-blue-500 text-blue-600";
  // if (gradeResult === "fail") return "border-red-500 text-red-600";
  // if (gradePoints !== null) {
  //   if (gradePoints >= 10) return "border-blue-500 text-blue-600";
  //   if (gradePoints >= 7) return "border-blue-500 text-blue-600";
  //   if (gradePoints >= 4) return "border-orange-500 text-orange-600";
  //   return "border-red-500 text-red-600";
  // }
  return "border-gray-200 text-gray-400";
}

// Renders nothing when there's no grade yet — unlike ScoreBadge, this never
// shows a "not graded" placeholder (see AGENTS request: the badge should
// only ever appear once a grade actually exists).
export function GradeSquareBadge({
  gradePoints,
  gradeResult,
  sizeClassName = "h-9 w-9",
  compact = false,
}: {
  gradePoints: number | null;
  gradeResult: string | null;
  // Lets a taller layout (e.g. the calendar's 2-line lesson title) stretch
  // the badge to match instead of the default fixed square.
  sizeClassName?: string;
  // Shrinks the inner icon/number to fit a smaller sizeClassName box (e.g.
  // the calendar card's footer row).
  compact?: boolean;
}) {
  const t = useTranslations("LessonWizard");

  if (gradePoints === null && gradeResult !== "pass" && gradeResult !== "fail") {
    return null;
  }

  const label =
    gradeResult === "pass"
      ? t("scorePass")
      : gradeResult === "fail"
        ? t("scoreFail")
        : t("scoreValue", { points: gradePoints as number });

  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className={`flex shrink-0 items-center justify-center rounded-lg border-2 bg-white ${sizeClassName} ${gradeColorClasses(gradePoints, gradeResult)}`}
    >
      {gradeResult === "pass" ? (
        <Check className={compact ? "h-3 w-3" : "h-5 w-5"} strokeWidth={3} aria-hidden="true" />
      ) : gradeResult === "fail" ? (
        <X className={compact ? "h-3 w-3" : "h-5 w-5"} strokeWidth={3} aria-hidden="true" />
      ) : (
        <span className={`font-bold ${compact ? "text-[10px]" : "text-sm"}`} aria-hidden="true">
          {gradePoints}
        </span>
      )}
    </div>
  );
}
