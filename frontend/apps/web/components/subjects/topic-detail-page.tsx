"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useGetSubject, useGetTopic } from "@school-ahead/api-client/browser/academics/academics";
import { useGetTopicProgress, useListTopicLessons } from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { ScoreBadge } from "@/components/score-badge";

const PAGE_SIZE = 10;

export function TopicDetailPage({ subjectId, topicId }: { subjectId: number; topicId: number }) {
  const t = useTranslations("TopicDetail");
  const [page, setPage] = useState(0);

  const subjectQuery = useGetSubject(subjectId);
  const topicQuery = useGetTopic(topicId);
  const progressQuery = useGetTopicProgress(topicId);
  const lessonsQuery = useListTopicLessons(topicId, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });

  if (topicQuery.isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (topicQuery.isError || !topicQuery.data) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  const topic = topicQuery.data;
  const percent = progressQuery.data?.completed_percent ?? 0;
  const lessons = lessonsQuery.data?.items ?? [];
  const totalCount = lessonsQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("breadcrumbSubjects"), href: "/subjects" },
    { label: subjectQuery.data?.name ?? "…", href: `/subjects/${subjectId}` },
    { label: topic.title },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3 border-b border-gray-200 pb-4">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-gray-900">{topic.title}</h1>
          {topic.subject_block_label && (
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
              {topic.subject_block_label}
            </span>
          )}
        </div>
        {topic.description && <p className="text-sm text-gray-600">{topic.description}</p>}
      </div>

      <ProgressBar percent={percent} label={t("progressLabel")} />

      <div className="flex flex-col gap-3">
        {lessonsQuery.isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
        {lessonsQuery.isError && <p className="text-sm text-red-600">{t("error")}</p>}
        {!lessonsQuery.isLoading && !lessonsQuery.isError && lessons.length === 0 && (
          <p className="text-sm text-gray-500">{t("noLessons")}</p>
        )}

        {lessons.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
                <tr>
                  <th className="px-4 py-2">{t("columnLesson")}</th>
                  <th className="px-4 py-2">{t("columnBlock")}</th>
                  <th className="px-4 py-2">{t("columnStatus")}</th>
                  <th className="px-4 py-2">{t("columnScore")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lessons.map((lesson) => (
                  <tr key={lesson.id}>
                    <td className="px-4 py-2">
                      <Link href={`/lessons/${lesson.id}`} className="font-medium text-gray-900 hover:underline">
                        {lesson.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {lesson.subject_block_label ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={lesson.status} />
                    </td>
                    <td className="px-4 py-2">
                      <ScoreBadge gradePoints={lesson.grade_points} gradeResult={lesson.grade_result} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(0, prev - 1))}
              disabled={page === 0}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("previousPage")}
            </button>
            <span className="text-xs text-gray-500">
              {t("pageIndicator", { page: page + 1, totalPages })}
            </span>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages - 1, prev + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("nextPage")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
