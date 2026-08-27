"use client";

import { useTranslations } from "next-intl";
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  ListChecks,
  MessageCircleQuestion,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";

export type WizardStep = "materials" | "assessment" | "comments" | "explanation";

// Icon + label for the assessment tab depend on the lesson's type: a quiz
// gets a checklist icon and "Тест" label, a task a clipboard, and a
// theory-only lesson the "everything clear" confirmation icon (see
// TheoryStep's "Чи все зрозуміло?" prompt).
const ASSESSMENT_ICON: Record<string, LucideIcon> = {
  with_quiz: ListChecks,
  with_task: ClipboardList,
  theory: CheckCircle2,
};

// Tab switcher rendered directly under the lesson title — the breadcrumb no
// longer encodes the current step (docs/interfaces/student/lesson.md), so
// this is the only way to move between the wizard's sections. "Пояснення"
// only appears once a help_request has ever been raised on the lesson (see
// lesson-wizard.tsx's `hasExplanation`) — most lessons never show it.
export function StepSwitcher({
  step,
  lessonType,
  hasExplanation,
  onChange,
}: {
  step: WizardStep;
  lessonType: string;
  hasExplanation: boolean;
  onChange: (step: WizardStep) => void;
}) {
  const t = useTranslations("LessonWizard");
  const AssessmentIcon = ASSESSMENT_ICON[lessonType] ?? ClipboardList;
  const assessmentLabel = lessonType === "with_quiz" ? t("breadcrumbQuiz") : t("breadcrumbAssessment");

  const tabs: { value: WizardStep; label: string; Icon: LucideIcon }[] = [
    { value: "materials", label: t("breadcrumbMaterials"), Icon: BookOpen },
    { value: "assessment", label: assessmentLabel, Icon: AssessmentIcon },
    { value: "comments", label: t("breadcrumbComments"), Icon: MessageSquare },
    ...(hasExplanation
      ? [{ value: "explanation" as const, label: t("breadcrumbExplanation"), Icon: MessageCircleQuestion }]
      : []),
  ];

  return (
    <div
      role="tablist"
      className="inline-flex w-fit flex-wrap gap-1 rounded-md border border-gray-200 p-0.5"
    >
      {tabs.map(({ value, label, Icon }) => {
        const isActive = step === value;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(value)}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              isActive ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
