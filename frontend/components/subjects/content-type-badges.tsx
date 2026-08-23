"use client";

import { useTranslations } from "next-intl";

// Lesson.lesson_type is a single value (theory / with_quiz / with_task —
// see backend/lessons/models.py): one badge per lesson, not "theory + extra".
const TYPE_STYLES: Record<string, { icon: string; labelKey: string; colorClasses: string }> = {
  theory: { icon: "📖", labelKey: "contentTheory", colorClasses: "bg-indigo-100 text-indigo-700" },
  with_quiz: { icon: "📝", labelKey: "contentQuiz", colorClasses: "bg-emerald-100 text-emerald-700" },
  with_task: { icon: "📌", labelKey: "contentTask", colorClasses: "bg-rose-100 text-rose-700" },
};

export function ContentTypeBadges({ lessonType }: { lessonType: string }) {
  const t = useTranslations("SubjectDetail");
  const style = TYPE_STYLES[lessonType] ?? TYPE_STYLES.theory;

  return (
    <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.colorClasses}`}>
      {style.icon} {t(style.labelKey)}
    </span>
  );
}
