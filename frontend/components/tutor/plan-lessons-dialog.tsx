"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { useGetTutorClass, useListTutorClasses } from "@/lib/api/browser/tutor/tutor";
import { useSchedulingApiGenerateClassSchedule } from "@/lib/api/browser/schedule/schedule";
import type { GenerateClassScheduleOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

const DEFAULT_PERIOD_DAYS = 13; // ~2 weeks, a reasonable starting range to adjust

// Local (not UTC) YYYY-MM-DD, matching <input type="date"> — toISOString()
// would shift the date near midnight in timezones behind UTC.
function isoOf(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIso(): string {
  return isoOf(new Date());
}

function addDaysIso(base: string, days: number): string {
  const date = new Date(`${base}T00:00:00`);
  date.setDate(date.getDate() + days);
  return isoOf(date);
}

// Opened from the class detail page's "Запланувати уроки" button. Lets a
// tutor pick a date range and how many lessons of each subject to fit into
// it, then calls the backend algorithm (scheduling.services.generate_class_schedule)
// that balances load and minimizes same-subject repeats across the range,
// accounting for whatever is already scheduled there (including reflowing
// already-planned, not-yet-completed lessons if needed to keep order).
export function PlanLessonsDialog({ classId }: { classId: number }) {
  const t = useTranslations("PlanLessons");
  const [open, setOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState(classId);
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(() => addDaysIso(todayIso(), DEFAULT_PERIOD_DAYS));
  const [lessonsCountBySubjectId, setLessonsCountBySubjectId] = useState<Record<number, number>>({});
  const [result, setResult] = useState<GenerateClassScheduleOut | null>(null);

  const classesQuery = useListTutorClasses({ query: { enabled: open } });
  const classDetailQuery = useGetTutorClass(selectedClassId, { query: { enabled: open } });
  const generateSchedule = useSchedulingApiGenerateClassSchedule();

  const subjects = classDetailQuery.data?.subjects ?? [];

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSelectedClassId(classId);
      setStartDate(todayIso());
      setEndDate(addDaysIso(todayIso(), DEFAULT_PERIOD_DAYS));
      setLessonsCountBySubjectId({});
      setResult(null);
    }
  };

  const isDateRangeValid = startDate <= endDate;
  const hasAnyLessons = subjects.some((subject) => (lessonsCountBySubjectId[subject.subject_id] ?? 0) > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDateRangeValid || !hasAnyLessons) return;

    const payloadSubjects = subjects
      .map((subject) => ({
        subject_id: subject.subject_id,
        lessons_count: lessonsCountBySubjectId[subject.subject_id] ?? 0,
      }))
      .filter((item) => item.lessons_count > 0);

    generateSchedule.mutate(
      {
        classId: selectedClassId,
        data: { start_date: startDate, end_date: endDate, subjects: payloadSubjects },
      },
      { onSuccess: (data) => setResult(data) },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          📅 {t("triggerButton")}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold text-gray-900">📅 {t("title")}</Dialog.Title>

          {result ? (
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-sm font-medium text-gray-900">{t("resultHeading")}</p>
              {result.subjects.length > 0 ? (
                <ul className="flex flex-col gap-1 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                  {result.subjects.map((item) => {
                    const subject = subjects.find((s) => s.subject_id === item.subject_id);
                    return (
                      <li key={item.subject_id}>
                        {t("subjectLessonsCount", { count: item.lessons_scheduled })} — {subject?.subject_name ?? item.subject_id}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">{t("nothingScheduled")}</p>
              )}
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
              <div className="flex flex-col gap-1">
                <label htmlFor="plan-class" className="text-xs font-medium text-gray-700">
                  {t("classLabel")}
                </label>
                <select
                  id="plan-class"
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(Number(e.target.value))}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                >
                  {(classesQuery.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end gap-3">
                <div className="flex flex-1 flex-col gap-1">
                  <label htmlFor="plan-start" className="text-xs font-medium text-gray-700">
                    {t("startDateLabel")}
                  </label>
                  <input
                    id="plan-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                  />
                </div>
                <span className="pb-2 text-sm text-gray-500">{t("dateRangeSeparator")}</span>
                <div className="flex flex-1 flex-col gap-1">
                  <label htmlFor="plan-end" className="text-xs font-medium text-gray-700">
                    {t("endDateLabel")}
                  </label>
                  <input
                    id="plan-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                  />
                </div>
              </div>
              {!isDateRangeValid && <p className="text-sm text-red-600">{t("invalidDateRange")}</p>}

              <div className="flex flex-col gap-2 border-t border-gray-200 pt-3">
                <p className="text-sm font-medium text-gray-900">{t("subjectsTitle")}</p>

                {classDetailQuery.isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
                {!classDetailQuery.isLoading && subjects.length === 0 && (
                  <p className="text-sm text-gray-500">{t("noSubjects")}</p>
                )}

                {subjects.map((subject) => (
                  <div key={subject.subject_id} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-700">{subject.subject_name}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={lessonsCountBySubjectId[subject.subject_id] ?? 0}
                        onChange={(e) =>
                          setLessonsCountBySubjectId((prev) => ({
                            ...prev,
                            [subject.subject_id]: Math.max(0, Number(e.target.value)),
                          }))
                        }
                        className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700"
                      />
                      <span className="text-xs text-gray-500">{t("lessonsCountSuffix")}</span>
                    </div>
                  </div>
                ))}
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
                  disabled={!hasAnyLessons || !isDateRangeValid || generateSchedule.isPending}
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
