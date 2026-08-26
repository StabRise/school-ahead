"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getListSubjectTopicsQueryKey, useGetSubject, useListSubjectTopics } from "@/lib/api/browser/academics/academics";
import {
  getListTutorSubjectLessonsQueryKey,
  useDeleteTutorTopic,
  useListTutorSubjectLessons,
  useReorderTutorSubjectTopics,
  useSetTopicBlock,
} from "@/lib/api/browser/tutor/tutor";
import type { LessonOut, SubjectBlockOut, TopicOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { Card } from "@/components/card";
import { ContentTypeBadges } from "@/components/subjects/content-type-badges";
import { LoadLessonsJsonDialog } from "./load-lessons-json-dialog";

interface BlockGroup {
  key: string;
  label: string | null;
  // The real SubjectBlock id a topic gets pinned to when dropped into this
  // group (set_topic_block) — null for the blockless "all" fallback and for
  // "unassigned", neither of which is a valid drag-and-drop target.
  blockId: number | null;
  topics: TopicOut[];
}

// Grouped off the subject's actual SubjectBlock rows (id + label, in
// index order) rather than inferred from contiguous topic order — a tutor
// can now move a topic to any block (set_topic_block, or by dragging it —
// see TutorSubjectDetailPage's handleDrop), which can break the even-split
// contiguity the old scan-based grouping relied on. A topic whose block no
// longer exists (should self-heal on the next assign_topics_to_blocks
// recompute) falls into a trailing "unassigned" group instead of
// disappearing. Empty real blocks are kept (not filtered out) so a tutor
// can still drag a topic into a currently-empty semester.
function groupTopicsByBlock(topics: TopicOut[], blocks: SubjectBlockOut[]): BlockGroup[] {
  if (blocks.length === 0) {
    return topics.length > 0 ? [{ key: "all", label: null, blockId: null, topics }] : [];
  }

  const blockIds = new Set(blocks.map((block) => block.id));
  const topicsByBlockId = new Map<number, TopicOut[]>();
  const unassigned: TopicOut[] = [];

  for (const topic of topics) {
    if (topic.subject_block_id !== null && blockIds.has(topic.subject_block_id)) {
      const list = topicsByBlockId.get(topic.subject_block_id) ?? [];
      list.push(topic);
      topicsByBlockId.set(topic.subject_block_id, list);
    } else {
      unassigned.push(topic);
    }
  }

  const groups: BlockGroup[] = blocks.map((block) => ({
    key: `block-${block.id}`,
    label: block.label,
    blockId: block.id,
    topics: topicsByBlockId.get(block.id) ?? [],
  }));

  if (unassigned.length > 0) {
    groups.push({ key: "unassigned", label: null, blockId: null, topics: unassigned });
  }

  return groups;
}

function LessonRow({ lesson }: { lesson: LessonOut }) {
  const t = useTranslations("SubjectDetail");
  return (
    <li>
      <Card
        href={`/tutor/lessons/${lesson.id}`}
        className="flex flex-col gap-1.5 bg-white sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="text-sm font-medium text-gray-900">
          {t("lessonRow", { index: lesson.order_index, title: lesson.title })}
        </span>
        <ContentTypeBadges lessonType={lesson.lesson_type} />
      </Card>
    </li>
  );
}

// Only rendered by the caller when the subject has more than one block —
// with a single block there's nowhere else to move a topic to.
function TopicBlockSelect({
  topic,
  blocks,
  subjectId,
}: {
  topic: TopicOut;
  blocks: SubjectBlockOut[];
  subjectId: number;
}) {
  const t = useTranslations("TutorSubjectDetail");
  const queryClient = useQueryClient();
  const setTopicBlock = useSetTopicBlock();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const subjectBlockId = Number(e.target.value);
    if (subjectBlockId === topic.subject_block_id) return;

    setTopicBlock.mutate(
      { topicId: topic.id, data: { subject_block_id: subjectBlockId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubjectTopicsQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonsQueryKey(subjectId) });
        },
      },
    );
  };

  return (
    <select
      value={topic.subject_block_id ?? ""}
      onChange={handleChange}
      disabled={setTopicBlock.isPending}
      aria-label={t("moveToBlockLabel")}
      className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700"
    >
      {blocks.map((block) => (
        <option key={block.id} value={block.id}>
          {block.label}
        </option>
      ))}
    </select>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
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
  );
}

function DragHandleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-300" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M7 4a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm3 6a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zm0 6a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zm4-12a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm3 6a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zm0 6a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
    </svg>
  );
}

function TopicSection({
  topic,
  lessons,
  blocks,
  subjectId,
  expanded,
  onToggle,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  topic: TopicOut;
  lessons: LessonOut[];
  blocks: SubjectBlockOut[];
  subjectId: number;
  expanded: boolean;
  onToggle: () => void;
  draggable: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const t = useTranslations("TutorSubjectDetail");
  const queryClient = useQueryClient();
  const deleteTopic = useDeleteTutorTopic();

  const handleDelete = () => {
    if (!window.confirm(t("deleteTopicConfirm", { title: topic.title, count: lessons.length }))) return;

    deleteTopic.mutate(
      { topicId: topic.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubjectTopicsQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonsQueryKey(subjectId) });
        },
      },
    );
  };

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`overflow-hidden rounded-md border border-gray-200 transition-opacity ${isDragging ? "opacity-40" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {draggable && <DragHandleIcon />}
          <ChevronIcon expanded={expanded} />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-gray-900">{topic.title}</span>
            <span className="text-xs text-gray-500">{t("lessonsCount", { count: lessons.length })}</span>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {blocks.length > 1 && <TopicBlockSelect topic={topic} blocks={blocks} subjectId={subjectId} />}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteTopic.isPending}
            className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            🗑️ {t("deleteTopicButton")}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50/50 p-3">
          {deleteTopic.isError && <p className="text-sm text-red-600">{t("deleteTopicError")}</p>}
          {lessons.length === 0 ? (
            <p className="text-sm text-gray-500">{t("noLessonsInTopic")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lessons.map((lesson) => (
                <LessonRow key={lesson.id} lesson={lesson} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function TutorSubjectDetailPage({ subjectId }: { subjectId: number }) {
  const t = useTranslations("TutorSubjectDetail");
  const queryClient = useQueryClient();

  const subjectQuery = useGetSubject(subjectId);
  const topicsQuery = useListSubjectTopics(subjectId);
  const lessonsQuery = useListTutorSubjectLessons(subjectId);

  const topics = useMemo(() => topicsQuery.data ?? [], [topicsQuery.data]);
  const lessons = useMemo(() => lessonsQuery.data ?? [], [lessonsQuery.data]);
  const blocks = useMemo(() => subjectQuery.data?.blocks ?? [], [subjectQuery.data]);

  const lessonsByTopicId = useMemo(() => {
    const map = new Map<number, LessonOut[]>();
    for (const lesson of lessons) {
      const list = map.get(lesson.topic_id) ?? [];
      list.push(lesson);
      map.set(lesson.topic_id, list);
    }
    return map;
  }, [lessons]);

  const blockGroups = useMemo(() => groupTopicsByBlock(topics, blocks), [topics, blocks]);

  const [expandedOverrides, setExpandedOverrides] = useState<Record<number, boolean>>({});
  const isExpanded = (topicId: number) => expandedOverrides[topicId] ?? false;
  const allExpanded = topics.length > 0 && topics.every((topic) => isExpanded(topic.id));

  const toggleTopic = (topicId: number) => {
    setExpandedOverrides((prev) => ({ ...prev, [topicId]: !isExpanded(topicId) }));
  };

  const toggleAll = () => {
    const next = !allExpanded;
    setExpandedOverrides(Object.fromEntries(topics.map((topic) => [topic.id, next])));
  };

  const [draggedTopicId, setDraggedTopicId] = useState<number | null>(null);
  const reorderTopics = useReorderTutorSubjectTopics();
  const setTopicBlockForDrag = useSetTopicBlock();

  const findGroupAndIndex = (topicId: number) => {
    for (const group of blockGroups) {
      const index = group.topics.findIndex((topic) => topic.id === topicId);
      if (index !== -1) return { group, index };
    }
    return null;
  };

  // Drops a topic either onto another topic (inserted immediately before
  // it, targetTopicId set) or onto a group's empty space (appended at the
  // end, targetTopicId null). Recomputes order_index for every topic from
  // the resulting flattened order, then — only when the topic actually
  // changed semester — pins it to the target block so the next
  // assign_topics_to_blocks recompute can't silently move it back.
  const handleDrop = (targetGroup: BlockGroup, targetTopicId: number | null) => {
    if (draggedTopicId === null) return;
    const source = findGroupAndIndex(draggedTopicId);
    setDraggedTopicId(null);
    if (!source) return;
    if (source.group.key === targetGroup.key && targetTopicId === draggedTopicId) return;

    const newGroups = blockGroups.map((group) => ({ ...group, topics: [...group.topics] }));
    const newSourceGroup = newGroups.find((group) => group.key === source.group.key)!;
    const newTargetGroup = newGroups.find((group) => group.key === targetGroup.key)!;

    const sourceIndex = newSourceGroup.topics.findIndex((topic) => topic.id === draggedTopicId);
    const [draggedTopic] = newSourceGroup.topics.splice(sourceIndex, 1);

    let insertIndex = newTargetGroup.topics.length;
    if (targetTopicId !== null) {
      const targetIndex = newTargetGroup.topics.findIndex((topic) => topic.id === targetTopicId);
      if (targetIndex !== -1) insertIndex = targetIndex;
    }
    newTargetGroup.topics.splice(insertIndex, 0, draggedTopic);

    const items = newGroups
      .flatMap((group) => group.topics)
      .map((topic, index) => ({ id: topic.id, order_index: index + 1 }));

    reorderTopics.mutate(
      { subjectId, data: { items } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubjectTopicsQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonsQueryKey(subjectId) });

          if (targetGroup.blockId !== null && targetGroup.blockId !== source.group.blockId) {
            setTopicBlockForDrag.mutate(
              { topicId: draggedTopic.id, data: { subject_block_id: targetGroup.blockId } },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListSubjectTopicsQueryKey(subjectId) });
                },
              },
            );
          }
        },
      },
    );
  };

  const isLoading = subjectQuery.isLoading || topicsQuery.isLoading || lessonsQuery.isLoading;
  const isError = subjectQuery.isError || topicsQuery.isError || lessonsQuery.isError;

  if (isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (isError || !subjectQuery.data) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  const subject = subjectQuery.data;
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("breadcrumbMySubjects"), href: "/tutor/subjects" },
    { label: subject.class_name, href: `/tutor/classes/${subject.school_class_id}` },
    { label: subject.name },
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">{subject.name}</h1>
          <LoadLessonsJsonDialog subjectId={subjectId} />
        </div>
        <p className="text-sm text-gray-700">
          {t("classLabel")}: <span className="font-medium">{subject.class_name}</span>
        </p>
      </div>

      {topics.length === 0 ? (
        <p className="text-sm text-gray-500">{t("noTopics")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">{t("dragHint")}</p>
            <button type="button" onClick={toggleAll} className="text-sm font-medium text-blue-700 hover:underline">
              {allExpanded ? t("collapseAll") : t("expandAll")}
            </button>
          </div>

          <div className="flex flex-col gap-6">
            {blockGroups.map((group) => {
              const isDropTarget = group.key !== "unassigned";
              return (
                <div
                  key={group.key}
                  onDragOver={(e) => {
                    if (isDropTarget && draggedTopicId !== null) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (!isDropTarget) return;
                    e.preventDefault();
                    handleDrop(group, null);
                  }}
                  className="flex flex-col gap-4"
                >
                  {group.label && <h2 className="text-lg font-semibold text-gray-900">{group.label}</h2>}
                  {group.topics.length === 0 ? (
                    <p className="rounded-md border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-400">
                      {t("emptySemesterDropHint")}
                    </p>
                  ) : (
                    group.topics.map((topic) => (
                      <TopicSection
                        key={topic.id}
                        topic={topic}
                        lessons={lessonsByTopicId.get(topic.id) ?? []}
                        blocks={blocks}
                        subjectId={subjectId}
                        expanded={isExpanded(topic.id)}
                        onToggle={() => toggleTopic(topic.id)}
                        draggable={isDropTarget}
                        isDragging={draggedTopicId === topic.id}
                        onDragStart={(e) => {
                          setDraggedTopicId(topic.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDraggedTopicId(null)}
                        onDragOver={(e) => {
                          if (isDropTarget && draggedTopicId !== null) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          if (!isDropTarget) return;
                          e.preventDefault();
                          e.stopPropagation();
                          handleDrop(group, topic.id);
                        }}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
