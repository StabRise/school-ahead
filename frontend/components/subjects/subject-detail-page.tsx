"use client";

import { useTranslations } from "next-intl";
import { useGetSubject, useListSubjectTopics } from "@/lib/api/browser/academics/academics";
import { useGetSubjectProgress } from "@/lib/api/browser/student-lessons/student-lessons";
import { PageContainer } from "@/components/page-container";
import { Markdown } from "@/components/markdown";
import { ProgressBar } from "@/components/progress-bar";
import { Tabs } from "@/components/tabs";
import { Card } from "@/components/card";

export function SubjectDetailPage({ subjectId }: { subjectId: number }) {
  const t = useTranslations("SubjectDetail");
  const subjectQuery = useGetSubject(subjectId);
  const progressQuery = useGetSubjectProgress(subjectId);
  const topicsQuery = useListSubjectTopics(subjectId);

  if (subjectQuery.isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (subjectQuery.isError || !subjectQuery.data) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  const subject = subjectQuery.data;
  const topics = topicsQuery.data ?? [];
  const percent = progressQuery.data?.completed_percent ?? 0;

  return (
    <PageContainer title={subject.name} maxWidthClassName="max-w-3xl">
      <Tabs
        tabs={[
          {
            value: "overview",
            label: t("tabOverview"),
            content: (
              <div className="flex flex-col gap-4">
                <ProgressBar percent={percent} label={t("progressLabel")} />
                {subject.description ? (
                  <Markdown content={subject.description} />
                ) : (
                  <p className="text-sm text-gray-500">{t("noDescription")}</p>
                )}
              </div>
            ),
          },
          {
            value: "resources",
            label: t("tabResources"),
            content: subject.recommended_resources ? (
              <Markdown content={subject.recommended_resources} />
            ) : (
              <p className="text-sm text-gray-500">{t("noResources")}</p>
            ),
          },
          {
            value: "topics",
            label: t("tabTopics"),
            content: (
              <>
                {topicsQuery.isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
                {topicsQuery.isError && <p className="text-sm text-red-600">{t("error")}</p>}
                {!topicsQuery.isLoading && !topicsQuery.isError && topics.length === 0 && (
                  <p className="text-sm text-gray-500">{t("noTopics")}</p>
                )}
                {topics.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {topics.map((topic) => (
                      <li key={topic.id}>
                        <Card
                          href={`/subjects/${subjectId}/topics/${topic.id}`}
                          className="flex items-center justify-between gap-4"
                        >
                          <span className="font-medium">{topic.title}</span>
                          <span className="shrink-0 text-xs text-gray-400">
                            {t("lessonsCount", { count: topic.lesson_count })}
                          </span>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ),
          },
        ]}
      />
    </PageContainer>
  );
}
