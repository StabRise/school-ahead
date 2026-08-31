"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useGetSubject } from "@/lib/api/browser/academics/academics";
import type { SubjectBlockOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Markdown } from "@/components/markdown";

const DATE_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", year: "numeric" });

function formatDate(value: string | null): string {
  return value ? DATE_FORMAT.format(new Date(`${value}T00:00:00`)) : "—";
}

function SemesterBlockItem({
  block,
  expanded,
  onToggle,
}: {
  block: SubjectBlockOut;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("SubjectPlan");

  return (
    <div className="overflow-hidden rounded-md border border-gray-200">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <span className="font-medium text-gray-900">{block.label}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-gray-100 bg-gray-50/50 p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-gray-500">{t("periodLabel")}</dt>
              <dd className="font-medium text-gray-900">
                {formatDate(block.starts_on)} – {formatDate(block.ends_on)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">{t("weeksCountLabel")}</dt>
              <dd className="font-medium text-gray-900">{block.weeks_count ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">{t("workloadLabel")}</dt>
              <dd className="font-medium text-gray-900">
                {block.workload !== null ? t("workloadValue", { value: block.workload.toFixed(2) }) : "—"}
              </dd>
            </div>
          </dl>
          {block.description ? (
            <Markdown content={block.description} />
          ) : (
            <p className="text-sm text-gray-400">{t("noDescription")}</p>
          )}
        </div>
      )}
    </div>
  );
}

// The "План" tab's content — shared by the tutor's and the student's Subject
// detail pages (both wrap it in the same Tabs alongside the existing
// lessons/course-plan view). One accordion item per SubjectBlock (semester),
// showing its markdown description plus period/weeks_count/workload.
export function SemesterPlan({ subjectId }: { subjectId: number }) {
  const t = useTranslations("SubjectPlan");
  const subjectQuery = useGetSubject(subjectId);
  const blocks = useMemo(() => subjectQuery.data?.blocks ?? [], [subjectQuery.data]);
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});

  const isExpanded = (blockId: number) => overrides[blockId] ?? true;
  const toggle = (blockId: number) => setOverrides((prev) => ({ ...prev, [blockId]: !isExpanded(blockId) }));

  if (subjectQuery.isLoading) {
    return <p className="text-sm text-gray-500">{t("loading")}</p>;
  }
  if (subjectQuery.isError) {
    return <p className="text-sm text-red-600">{t("error")}</p>;
  }
  if (blocks.length === 0) {
    return <p className="text-sm text-gray-500">{t("noBlocks")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block) => (
        <SemesterBlockItem
          key={block.id}
          block={block}
          expanded={isExpanded(block.id)}
          onToggle={() => toggle(block.id)}
        />
      ))}
    </div>
  );
}
