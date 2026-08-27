"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { List, Rows3 } from "lucide-react";
import { useGetSubject, useListSubjectTopics } from "@/lib/api/browser/academics/academics";
import {
  getGetTopicProgressQueryOptions,
  useGetSubjectProgress,
  useListStudentSubjectLessons,
} from "@/lib/api/browser/student-lessons/student-lessons";
import type { SubjectLessonOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { ExpandAllButton } from "@/components/expand-all-button";
import { ProgressBar } from "@/components/progress-bar";
import { ViewModeToggle } from "@/components/view-mode-toggle";
import { groupTopicsByBlock } from "@/components/subjects/group-topics-by-block";
import { useSubjectViewStore } from "@/stores/subject-view-store";
import { TopicAccordionItem } from "./topic-accordion-item";

// Topics come back pre-ordered by Topic.Meta.ordering (order_index) — see
// backend/academics/models.py.
export function CoursePlan({ subjectId }: { subjectId: number }) {
  const t = useTranslations("SubjectDetail");
  // Persisted across subjects via subject-view-store, so switching subjects
  // keeps the last chosen view instead of resetting to "brief" every time.
  const viewMode = useSubjectViewStore((s) => s.coursePlanViewMode);
  const setViewMode = useSubjectViewStore((s) => s.setCoursePlanViewMode);
  const topicsExpandedPreference = useSubjectViewStore((s) => s.coursePlanTopicsExpanded);
  const setTopicsExpandedPreference = useSubjectViewStore((s) => s.setCoursePlanTopicsExpanded);

  const subjectQuery = useGetSubject(subjectId);
  const topicsQuery = useListSubjectTopics(subjectId);
  // Every Lesson in the subject, not just this student's assigned ones — see
  // list_student_subject_lessons. Loaded eagerly (like the tutor's Subject
  // detail page) rather than per-topic, since not-yet-assigned lessons have
  // no StudentLesson row to lazily fetch by.
  const lessonsQuery = useListStudentSubjectLessons(subjectId);
  // Shares its cache with the Subject detail page's own call to this same
  // hook — this only reads its per-semester breakdown (see SubjectDetailPage,
  // which shows the overall percent and leaves the per-block bars to here,
  // next to each semester's name).
  const subjectProgressQuery = useGetSubjectProgress(subjectId);

  const blocks = useMemo(() => subjectQuery.data?.blocks ?? [], [subjectQuery.data]);
  const topics = useMemo(() => topicsQuery.data ?? [], [topicsQuery.data]);
  const lessons = useMemo(() => lessonsQuery.data ?? [], [lessonsQuery.data]);
  const blockProgressById = useMemo(() => {
    const map = new Map<number, number>();
    for (const block of subjectProgressQuery.data?.blocks ?? []) {
      map.set(block.id, block.completed_percent);
    }
    return map;
  }, [subjectProgressQuery.data]);

  const lessonsByTopicId = useMemo(() => {
    const map = new Map<number, SubjectLessonOut[]>();
    for (const lesson of lessons) {
      const list = map.get(lesson.topic_id) ?? [];
      list.push(lesson);
      map.set(lesson.topic_id, list);
    }
    return map;
  }, [lessons]);

  const blockGroups = useMemo(() => groupTopicsByBlock(topics, blocks), [topics, blocks]);

  const progressQueries = useQueries({
    queries: topics.map((topic) => getGetTopicProgressQueryOptions(topic.id)),
  });
  const progressByTopicId = useMemo(() => {
    const map = new Map<number, (typeof progressQueries)[number]["data"]>();
    topics.forEach((topic, index) => map.set(topic.id, progressQueries[index]?.data));
    return map;
  }, [topics, progressQueries]);

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

  // Per-topic manual toggles win first, then the sticky cross-subject
  // preference, then (only if the user never touched the toggle) the
  // smart default of auto-expanding the current topic.
  const isExpanded = (topicId: number) =>
    overrides[topicId] ?? topicsExpandedPreference ?? topicId === currentTopicId;
  const allExpanded = topics.length > 0 && topics.every((topic) => isExpanded(topic.id));

  const toggleTopic = (topicId: number) => {
    setOverrides((prev) => ({ ...prev, [topicId]: !isExpanded(topicId) }));
  };

  const toggleAll = () => {
    const next = !allExpanded;
    setTopicsExpandedPreference(next);
    setOverrides(Object.fromEntries(topics.map((topic) => [topic.id, next])));
  };

  const isLoading = topicsQuery.isLoading || lessonsQuery.isLoading;
  const isError = topicsQuery.isError || lessonsQuery.isError;

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

      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}
      {!isLoading && !isError && topics.length === 0 && <p className="text-sm text-gray-500">{t("noTopics")}</p>}

      <div className="flex flex-col gap-6">
        {blockGroups.map((group) => (
          <div key={group.key} className="flex flex-col gap-2">
            {group.label && (
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-gray-700">{group.label}</h3>
                {blocks.length > 1 && group.blockId !== null && blockProgressById.has(group.blockId) && (
                  <ProgressBar percent={blockProgressById.get(group.blockId)!} />
                )}
              </div>
            )}
            {group.topics.map((topic) => (
              <TopicAccordionItem
                key={topic.id}
                topic={topic}
                lessons={lessonsByTopicId.get(topic.id) ?? []}
                progress={progressByTopicId.get(topic.id)}
                expanded={isExpanded(topic.id)}
                onToggle={() => toggleTopic(topic.id)}
                viewMode={viewMode}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
