"use client";

import { useTranslations } from "next-intl";
import type { SubjectOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { useGetSubjectProgress } from "@/lib/api/browser/student-lessons/student-lessons";
import { Card } from "@/components/card";
import { ProgressBar } from "@/components/progress-bar";

// Deterministic per-subject accent color — SubjectOut has no color/icon data
// from the backend yet, so the marker is derived from the subject id.
const ICON_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
];

export function SubjectCard({ subject }: { subject: SubjectOut }) {
  const t = useTranslations("MySubjects");
  const progressQuery = useGetSubjectProgress(subject.id);
  const percent = progressQuery.data?.completed_percent ?? 0;
  const activeBlock = subject.blocks.find((block) => block.status === "active");
  const iconColor = ICON_COLORS[subject.id % ICON_COLORS.length];

  return (
    <Card
      href={`/subjects/${subject.id}`}
      className="flex h-full flex-col gap-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        {subject.icon ? (
          <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={subject.icon} alt="" className="h-full w-full object-cover" />
          </span>
        ) : (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white ${iconColor}`}
          >
            {subject.name.charAt(0).toUpperCase()}
          </span>
        )}
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
