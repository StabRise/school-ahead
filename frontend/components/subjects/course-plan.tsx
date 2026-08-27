"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { List, Rows3 } from "lucide-react";
import { useListSubjectTopics } from "@/lib/api/browser/academics/academics";
import { getGetTopicProgressQueryOptions } from "@/lib/api/browser/student-lessons/student-lessons";
import { ExpandAllButton } from "@/components/expand-all-button";
import { ViewModeToggle } from "@/components/view-mode-toggle";
import { TopicAccordionItem, type CoursePlanViewMode } from "./topic-accordion-item";

// Topics come back pre-ordered by Topic.Meta.ordering (order_index) — see
// backend/academics/models.py.
export function CoursePlan({ subjectId }: { subjectId: number }) {
  const t = useTranslations("SubjectDetail");
  const [viewMode, setViewMode] = useState<CoursePlanViewMode>("brief");
  const topicsQuery = useListSubjectTopics(subjectId);
  const topics = useMemo(() => topicsQuery.data ?? [], [topicsQuery.data]);

  const progressQueries = useQueries({
    queries: topics.map((topic) => getGetTopicProgressQueryOptions(topic.id)),
  });

  // Free lesson order (docs/interfaces/student/subjects_list.md): there's no
  // server notion of a "current" topic, so it's derived here as the first
  // topic (in curriculum order) that isn't fully completed yet.
  const currentTopicId = useMemo(() => {
    for (let i = 0; i < topics.length; i++) {
      const percent = progressQueries[i]?.data?.completed_percent;
      if (percent !== undefined && percent < 100) {
        return topics[i].id;
      }
    }
    return undefined;
  }, [topics, progressQueries]);

  const [overrides, setOverrides] = useState<Record<number, boolean>>({});

  const isExpanded = (topicId: number) => overrides[topicId] ?? topicId === currentTopicId;
  const allExpanded = topics.length > 0 && topics.every((topic) => isExpanded(topic.id));

  const toggleTopic = (topicId: number) => {
    setOverrides((prev) => ({ ...prev, [topicId]: !isExpanded(topicId) }));
  };

  const toggleAll = () => {
    const next = !allExpanded;
    setOverrides(Object.fromEntries(topics.map((topic) => [topic.id, next])));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">{t("coursePlan")}</h2>
        <div className="flex items-center gap-1">
          <ViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "brief", icon: List, label: t("viewModeBrief") },
              { value: "full", icon: Rows3, label: t("viewModeFull") },
            ]}
          />
          <ExpandAllButton
            expanded={allExpanded}
            onToggle={toggleAll}
            disabled={topics.length === 0}
            expandLabel={t("expandAll")}
            collapseLabel={t("collapseAll")}
          />
        </div>
      </div>

      {topicsQuery.isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {topicsQuery.isError && <p className="text-sm text-red-600">{t("error")}</p>}
      {!topicsQuery.isLoading && !topicsQuery.isError && topics.length === 0 && (
        <p className="text-sm text-gray-500">{t("noTopics")}</p>
      )}

      <div className="flex flex-col gap-2">
        {topics.map((topic, index) => (
          <TopicAccordionItem
            key={topic.id}
            topic={topic}
            progress={progressQueries[index]?.data}
            expanded={isExpanded(topic.id)}
            onToggle={() => toggleTopic(topic.id)}
            viewMode={viewMode}
          />
        ))}
      </div>
    </div>
  );
}
