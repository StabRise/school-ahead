"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useGetSubject } from "@/lib/api/browser/academics/academics";
import { useGetSubjectProgress } from "@/lib/api/browser/student-lessons/student-lessons";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { Markdown } from "@/components/markdown";
import { ProgressBar } from "@/components/progress-bar";
import { Tabs } from "@/components/tabs";
import { CourseBadge } from "@/components/subjects/course-badge";
import { SemesterPlan } from "@/components/subjects/semester-plan";
import { NextLessonCard } from "./next-lesson-card";
import { CoursePlan } from "./course-plan";

type InfoPanel = "about" | "resources" | null;

export function SubjectDetailPage({ subjectId }: { subjectId: number }) {
  const t = useTranslations("SubjectDetail");
  const [openPanel, setOpenPanel] = useState<InfoPanel>(null);

  const subjectQuery = useGetSubject(subjectId);
  const progressQuery = useGetSubjectProgress(subjectId);

  if (subjectQuery.isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (subjectQuery.isError || !subjectQuery.data) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  const subject = subjectQuery.data;
  const percent = progressQuery.data?.completed_percent ?? 0;

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("breadcrumbMySubjects"), href: "/subjects" },
    { label: subject.name },
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">{subject.name}</h1>
          <CourseBadge badge={progressQuery.data?.badge} />
        </div>
        <p className="text-sm text-gray-500">
          {subject.teacher_name && (
            <>
              {t("teacherLabel")}: {subject.teacher_name} &middot;{" "}
            </>
          )}
          {t("courseProgressLabel")}: <span className="font-medium text-gray-700">{Math.round(percent)}%</span>
        </p>
        <ProgressBar percent={percent} />

        <div className="flex flex-wrap gap-4 pt-1">
          {subject.description && (
            <button
              type="button"
              onClick={() => setOpenPanel((prev) => (prev === "about" ? null : "about"))}
              className="text-sm font-medium text-blue-700"
            >
              ℹ️ {t("aboutSubject")}
            </button>
          )}
          {subject.recommended_resources && (
            <button
              type="button"
              onClick={() => setOpenPanel((prev) => (prev === "resources" ? null : "resources"))}
              className="text-sm font-medium text-blue-700"
            >
              📚 {t("recommendedResources")}
            </button>
          )}
        </div>

        {openPanel === "about" && subject.description && (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <Markdown content={subject.description} />
          </div>
        )}
        {openPanel === "resources" && subject.recommended_resources && (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <Markdown content={subject.recommended_resources} />
          </div>
        )}
      </div>

      <Tabs
        tabs={[
          {
            value: "lessons",
            label: t("lessonsTab"),
            content: (
              <div className="flex flex-col gap-6">
                <NextLessonCard subjectId={subjectId} />
                <CoursePlan subjectId={subjectId} />
              </div>
            ),
          },
          {
            value: "plan",
            label: t("planTab"),
            content: <SemesterPlan subjectId={subjectId} />,
          },
        ]}
      />
    </div>
  );
}
