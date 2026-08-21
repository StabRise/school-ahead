"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useConfirmUnderstanding } from "@/lib/api/browser/student-lessons/student-lessons";
import { Raccoon } from "@/components/preschool/raccoon";
import { ScreenFrame } from "@/components/preschool/screen-frame";

const ANSWER_DELAY_MS = 900;

// "Чи все зрозуміло?" as a quiz-styled question instead of plain text
// buttons — a banner + two big picture cards, matching the same visual
// language as the practice-step quiz. See docs/interfaces/student/
// preschool/lesson.md.
export function PreschoolTheoryCheck({
  studentLessonId,
  onChanged,
}: {
  studentLessonId: number;
  onChanged: () => void;
}) {
  const t = useTranslations("PreschoolTheoryCheck");
  const [picked, setPicked] = useState<"yes" | "no" | null>(null);
  const confirmUnderstanding = useConfirmUnderstanding();

  const handlePick = (understood: boolean) => {
    if (picked !== null) return;
    setPicked(understood ? "yes" : "no");

    window.setTimeout(() => {
      confirmUnderstanding.mutate(
        { studentLessonId, data: { understood } },
        { onSuccess: () => onChanged() },
      );
    }, ANSWER_DELAY_MS);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-3">
      <ScreenFrame>
        <div className="w-full rounded-[2rem] bg-gradient-to-r from-sky-400 via-emerald-400 to-amber-300 px-6 py-5 text-center shadow-xl">
          <p className="text-lg font-extrabold text-white">{t("question")}</p>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            disabled={picked !== null}
            onClick={() => handlePick(true)}
            className={`flex flex-col items-center gap-2 rounded-3xl bg-emerald-400 p-5 shadow-lg transition-transform disabled:cursor-default ${
              picked === null ? "active:scale-95" : ""
            } ${picked === "no" ? "opacity-50" : ""}`}
            style={{ outline: picked === "yes" ? "4px solid #16a34a" : undefined }}
          >
            <Raccoon mood={picked === "yes" ? "happy" : "idle"} className="h-20 w-20" />
            <span className="text-lg font-bold text-white">{t("yesButton")}</span>
          </button>

          <button
            type="button"
            disabled={picked !== null}
            onClick={() => handlePick(false)}
            className={`flex flex-col items-center gap-2 rounded-3xl bg-amber-400 p-5 shadow-lg transition-transform disabled:cursor-default ${
              picked === null ? "active:scale-95" : ""
            } ${picked === "yes" ? "opacity-50" : ""}`}
            style={{ outline: picked === "no" ? "4px solid #d97706" : undefined }}
          >
            <Raccoon mood="sad" className="h-20 w-20" />
            <span className="text-lg font-bold text-white">{t("noButton")}</span>
          </button>
        </div>

        {picked === "yes" && <p className="text-sm font-bold text-emerald-700">{t("yesFeedback")}</p>}
        {picked === "no" && <p className="text-sm font-bold text-amber-700">{t("noFeedback")}</p>}
      </ScreenFrame>
    </div>
  );
}
