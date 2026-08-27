"use client";

import { useTranslations } from "next-intl";
import type { SubjectOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { useGetSubjectProgress } from "@/lib/api/browser/student-lessons/student-lessons";
import { Card } from "@/components/card";
import { ProgressBar } from "@/components/progress-bar";
import { SubjectIcon } from "./subject-icon";

export function SubjectCard({ subject }: { subject: SubjectOut }) {
  const t = useTranslations("MySubjects");
  const progressQuery = useGetSubjectProgress(subject.id);
  const percent = progressQuery.data?.completed_percent ?? 0;
  const activeBlock = subject.blocks.find((block) => block.status === "active");

  return (
    <Card
      href={`/subjects/${subject.id}`}
      className="flex h-full flex-col gap-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <SubjectIcon id={subject.id} name={subject.name} iconUrl={subject.icon} />
        <span className="font-medium text-gray-900">{subject.name}</span>
      </div>

      <ProgressBar percent={percent} label={t("progressLabel")} />

      {activeBlock && (
        <span className="self-start rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
          {activeBlock.label}
        </span>
      )}
    </Card>
  );
}
