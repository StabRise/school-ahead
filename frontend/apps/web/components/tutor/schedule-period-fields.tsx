"use client";

import { useTranslations } from "next-intl";
import type { GenerateClassScheduleOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

// Shared building blocks for the "Plan lessons" popups — PlanLessonsDialog
// (class detail page, one or more subjects) and PlanSubjectLessonsDialog
// (subject detail page, a single subject pre-selected). Both submit to the
// same scheduling.services.generate_class_schedule endpoint; only how the
// subject(s)/count(s) are chosen differs.

export function DateRangeFields({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
}) {
  const t = useTranslations("PlanLessons");
  const isValid = startDate <= endDate;

  return (
    <>
      <div className="flex items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="plan-start" className="text-xs font-medium text-gray-700">
            {t("startDateLabel")}
          </label>
          <input
            id="plan-start"
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
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
            onChange={(e) => onEndDateChange(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
          />
        </div>
      </div>
      {!isValid && <p className="text-sm text-red-600">{t("invalidDateRange")}</p>}
    </>
  );
}

export function LessonsCountInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const t = useTranslations("PlanLessons");
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700"
      />
      <span className="text-xs text-gray-500">{t("lessonsCountSuffix")}</span>
    </div>
  );
}

export function ScheduleResultView({
  result,
  subjectName,
}: {
  result: GenerateClassScheduleOut;
  subjectName: (subjectId: number) => string;
}) {
  const t = useTranslations("PlanLessons");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium text-gray-900">{t("resultHeading")}</p>
      {result.subjects.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
          {result.subjects.map((item) => (
            <li key={item.subject_id}>
              {t("subjectLessonsCount", { count: item.lessons_scheduled })} — {subjectName(item.subject_id)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">{t("nothingScheduled")}</p>
      )}
    </div>
  );
}
