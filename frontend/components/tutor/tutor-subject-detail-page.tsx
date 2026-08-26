"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getListSubjectTopicsQueryKey, useGetSubject, useListSubjectTopics } from "@/lib/api/browser/academics/academics";
import {
  getListTutorSubjectLessonsQueryKey,
  useDeleteTutorTopic,
  useListTutorSubjectLessons,
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
  topics: TopicOut[];
}

// Grouped off the subject's actual SubjectBlock rows (id + label, in
// index order) rather than inferred from contiguous topic order — a tutor
// can now move a topic to any block (set_topic_block), which can break the
// even-split contiguity the old scan-based grouping relied on. A topic
// whose block no longer exists (should self-heal on the next
// assign_topics_to_blocks recompute) falls into a trailing "unassigned"
// group instead of disappearing.
function groupTopicsByBlock(topics: TopicOut[], blocks: SubjectBlockOut[]): BlockGroup[] {
  if (blocks.length === 0) {
    return topics.length > 0 ? [{ key: "all", label: null, topics }] : [];
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

  const groups: BlockGroup[] = blocks
    .map((block) => ({
      key: `block-${block.id}`,
      label: block.label,
      topics: topicsByBlockId.get(block.id) ?? [],
    }))
    .filter((group) => group.topics.length > 0);

  if (unassigned.length > 0) {
    groups.push({ key: "unassigned", label: null, topics: unassigned });
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

function TopicSection({
  topic,
  lessons,
  blocks,
  subjectId,
}: {
  topic: TopicOut;
  lessons: LessonOut[];
  blocks: SubjectBlockOut[];
  subjectId: number;
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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-gray-900">{topic.title}</h3>
        <div className="flex items-center gap-2">
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
  );
}

export function TutorSubjectDetailPage({ subjectId }: { subjectId: number }) {
  const t = useTranslations("TutorSubjectDetail");

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
        <div className="flex flex-col gap-6">
          {blockGroups.map((group) => (
            <div key={group.key} className="flex flex-col gap-4">
              {group.label && <h2 className="text-lg font-semibold text-gray-900">{group.label}</h2>}
              {group.topics.map((topic) => (
                <TopicSection
                  key={topic.id}
                  topic={topic}
                  lessons={lessonsByTopicId.get(topic.id) ?? []}
                  blocks={blocks}
                  subjectId={subjectId}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
