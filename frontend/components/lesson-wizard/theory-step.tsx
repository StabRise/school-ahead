"use client";

import { useTranslations } from "next-intl";
import { useConfirmUnderstanding } from "@/lib/api/browser/student-lessons/student-lessons";

export function TheoryStep({
  studentLessonId,
  onChanged,
}: {
  studentLessonId: number;
  onChanged: () => void;
}) {
  const t = useTranslations("TheoryStep");
  const confirmUnderstanding = useConfirmUnderstanding();

  const confirm = (understood: boolean) => {
    confirmUnderstanding.mutate(
      { studentLessonId, data: { understood } },
      { onSuccess: () => onChanged() },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg font-semibold">{t("question")}</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={confirmUnderstanding.isPending}
          onClick={() => confirm(true)}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("yesButton")}
        </button>
        <button
          type="button"
          disabled={confirmUnderstanding.isPending}
          onClick={() => confirm(false)}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          {t("noButton")}
        </button>
      </div>
    </div>
  );
}
