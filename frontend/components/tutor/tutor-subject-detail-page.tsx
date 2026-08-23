"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useGetSubject, useListSubjectTopics } from "@/lib/api/browser/academics/academics";
import { useListTutorSubjectLessons } from "@/lib/api/browser/tutor/tutor";
import type { LessonOut, TopicOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { Card } from "@/components/card";
import { ContentTypeBadges } from "@/components/subjects/content-type-badges";

interface BlockGroup {
  label: string | null;
  topics: TopicOut[];
}

// Topics are already returned in curriculum order (Topic.Meta.ordering), and
// academics.services.assign_topics_to_blocks distributes them across blocks
// contiguously in that same order — so a single pass, starting a new group
// whenever the block label changes, reconstructs the block structure with no
// extra request for SubjectBlock rows themselves.
function groupTopicsByBlock(topics: TopicOut[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  for (const topic of topics) {
    const current = groups[groups.length - 1];
    if (current && current.label === topic.subject_block_label) {
      current.topics.push(topic);
    } else {
      groups.push({ label: topic.subject_block_label, topics: [topic] });
    }
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

function TopicSection({ topic, lessons }: { topic: TopicOut; lessons: LessonOut[] }) {
  const t = useTranslations("TutorSubjectDetail");
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium text-gray-900">{topic.title}</h3>
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

  const lessonsByTopicId = useMemo(() => {
    const map = new Map<number, LessonOut[]>();
    for (const lesson of lessons) {
      const list = map.get(lesson.topic_id) ?? [];
      list.push(lesson);
      map.set(lesson.topic_id, list);
    }
    return map;
  }, [lessons]);

  const blockGroups = useMemo(() => groupTopicsByBlock(topics), [topics]);

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
    { label: subject.name },
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={breadcrumbItems} />
        <h1 className="text-2xl font-semibold text-gray-900">{subject.name}</h1>
      </div>

      {topics.length === 0 ? (
        <p className="text-sm text-gray-500">{t("noTopics")}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {blockGroups.map((group, index) => (
            <div key={index} className="flex flex-col gap-4">
              {group.label && <h2 className="text-lg font-semibold text-gray-900">{group.label}</h2>}
              {group.topics.map((topic) => (
                <TopicSection key={topic.id} topic={topic} lessons={lessonsByTopicId.get(topic.id) ?? []} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
