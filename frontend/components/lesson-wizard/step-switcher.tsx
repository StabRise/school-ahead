"use client";

import { useTranslations } from "next-intl";

export type WizardStep = "materials" | "assessment";

// Quick two-way toggle between the wizard's two pages, always visible at the
// top of the lesson — the breadcrumb no longer encodes the current step
// (docs/interfaces/student/lesson.md), so this is the only way to jump back
// to Materials once on Assessment (or vice versa).
export function StepSwitcher({
  step,
  onChange,
}: {
  step: WizardStep;
  onChange: (step: WizardStep) => void;
}) {
  const t = useTranslations("LessonWizard");

  return (
    <div role="tablist" className="inline-flex w-fit gap-1 rounded-md border border-gray-200 p-0.5">
      {(["materials", "assessment"] as const).map((value) => {
        const isActive = step === value;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(value)}
            className={`rounded px-3 py-1 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              isActive ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {value === "materials" ? t("breadcrumbMaterials") : t("breadcrumbAssessment")}
          </button>
        );
      })}
    </div>
  );
}
