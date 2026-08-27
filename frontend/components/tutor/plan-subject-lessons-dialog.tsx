"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarPlus } from "lucide-react";
import { useSchedulingApiGenerateClassSchedule } from "@/lib/api/browser/schedule/schedule";
import type { GenerateClassScheduleOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { addDaysIso, todayIso } from "@/lib/dates";
import { DateRangeFields, LessonsCountInput, ScheduleResultView } from "./schedule-period-fields";

const DEFAULT_PERIOD_DAYS = 13; // ~2 weeks, a reasonable starting range to adjust

// Opened from the Subject detail page's "Запланувати <предмет>" button —
// same popup and generate_class_schedule algorithm as PlanLessonsDialog
// (class detail page), just pre-scoped to this one subject: no class or
// subject picker, only a date range and how many lessons of this subject to
// fit into it.
export function PlanSubjectLessonsDialog({
  classId,
  subjectId,
  subjectName,
}: {
  classId: number;
  subjectId: number;
  subjectName: string;
}) {
  const t = useTranslations("PlanLessons");
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(() => addDaysIso(todayIso(), DEFAULT_PERIOD_DAYS));
  const [lessonsCount, setLessonsCount] = useState(0);
  const [result, setResult] = useState<GenerateClassScheduleOut | null>(null);

  const generateSchedule = useSchedulingApiGenerateClassSchedule();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setStartDate(todayIso());
      setEndDate(addDaysIso(todayIso(), DEFAULT_PERIOD_DAYS));
      setLessonsCount(0);
      setResult(null);
    }
  };

  const isDateRangeValid = startDate <= endDate;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDateRangeValid || lessonsCount <= 0) return;

    generateSchedule.mutate(
      {
        classId,
        data: {
          start_date: startDate,
          end_date: endDate,
          subjects: [{ subject_id: subjectId, lessons_count: lessonsCount }],
        },
      },
      { onSuccess: (data) => setResult(data) },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          title={t("triggerButtonForSubject", { subject: subjectName })}
          aria-label={t("triggerButtonForSubject", { subject: subjectName })}
          className="shrink-0 rounded-md border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50"
        >
          <CalendarPlus className="h-4 w-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">
            📅 {t("titleForSubject", { subject: subjectName })}
          </Dialog.Title>

          {result ? (
            <div className="mt-4 flex flex-col gap-4">
              <ScheduleResultView result={result} subjectName={() => subjectName} />
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="self-end rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                >
                  {t("closeButton")}
                </button>
              </Dialog.Close>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
              <DateRangeFields
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />

              <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-3">
                <span className="text-sm font-medium text-gray-900">{subjectName}</span>
                <LessonsCountInput value={lessonsCount} onChange={setLessonsCount} />
              </div>

              <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">ℹ️ {t("infoNote")}</p>

              {generateSchedule.isError && <p className="text-sm text-red-600">{t("generateError")}</p>}

              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t("cancelButton")}
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={lessonsCount <= 0 || !isDateRangeValid || generateSchedule.isPending}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  🚀 {t("generateButton")}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
