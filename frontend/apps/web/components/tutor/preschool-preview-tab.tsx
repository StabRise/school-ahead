"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Cloud, Sun } from "@school-ahead/preschool-ui";
import { getListSubjectTopicsQueryKey } from "@school-ahead/api-client/browser/academics/academics";
import {
  getListTutorSubjectLessonsQueryKey,
  useDeleteTutorLesson,
  useDeleteTutorTopic,
  useUpdateTutorLessonIcon,
} from "@school-ahead/api-client/browser/tutor/tutor";
import type {
  LessonOut,
  SubjectLessonStudentOut,
  SubjectOut,
  TopicOut,
} from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { groupTopicsByBlock } from "@/components/subjects/group-topics-by-block";
import { PreschoolLessonTile } from "@/components/subjects/preschool-lesson-tile";

// A PreschoolLessonTile linking to the tutor's lesson detail page, with two
// small buttons in its top-right corner: load the lesson's YouTube
// thumbnail as its icon, and delete it. The tile itself stays a pure
// display component (shared with the real student screen), so the buttons
// live here — absolutely positioned *beside* the tile's link (not inside
// it) so clicking one never also navigates.
function PreschoolPreviewLessonTile({
  lesson,
  index,
  subjectIcon,
  subjectId,
  isAssigned,
}: {
  lesson: LessonOut;
  index: number;
  subjectIcon: string | null;
  subjectId: number;
  isAssigned: boolean;
}) {
  const t = useTranslations("TutorSubjectDetail");
  const queryClient = useQueryClient();
  const deleteLesson = useDeleteTutorLesson();
  const updateIcon = useUpdateTutorLessonIcon();

  const handleLoadImage = () => {
    updateIcon.mutate(
      { lessonId: lesson.id },
      {
        onSuccess: (data) => {
          if (data.updated === 0) {
            window.alert(t("updateLessonIconNoVideo"));
            return;
          }
          queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonsQueryKey(subjectId) });
        },
        onError: () => window.alert(t("updateLessonIconsError")),
      },
    );
  };

  const handleDelete = () => {
    if (!window.confirm(t("deleteLessonConfirm", { title: lesson.title }))) return;
    deleteLesson.mutate(
      { lessonId: lesson.id },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTutorSubjectLessonsQueryKey(subjectId) }),
        onError: () => window.alert(t("deleteLessonError")),
      },
    );
  };

  return (
    <div className="relative">
      <PreschoolLessonTile
        href={`/tutor/lessons/${lesson.id}`}
        icon={lesson.icon}
        subjectIcon={subjectIcon}
        lessonType={lesson.lesson_type}
        title={lesson.title}
        index={index}
      />
      <div className="absolute right-1.5 top-1.5 flex gap-1">
        <button
          type="button"
          onClick={handleLoadImage}
          disabled={updateIcon.isPending}
          title={t("updateLessonIconButton")}
          aria-label={t("updateLessonIconButton")}
          className="rounded-full bg-black/40 p-1 text-white hover:bg-sky-600 disabled:opacity-50 disabled:hover:bg-black/40"
        >
          {updateIcon.isPending ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="size-3" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isAssigned || deleteLesson.isPending}
          title={isAssigned ? t("deleteLessonDisabledTitle") : t("deleteLessonButton")}
          aria-label={isAssigned ? t("deleteLessonDisabledTitle") : t("deleteLessonButton")}
          className="rounded-full bg-black/40 p-1 text-white hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-black/40"
        >
          <Trash2 className="size-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// One topic's worth of lesson tiles, headed by its title and a delete-topic
// button — same grouping level (and same delete affordance) as the Lessons
// tab's TopicSection, so "all lessons with topics" also means a tutor can
// keep managing the curriculum from here instead of switching tabs.
function PreschoolPreviewTopicSection({
  topic,
  lessons,
  subjectIcon,
  subjectId,
  lessonStudentsByLessonId,
  collapsed,
  onToggleCollapsed,
}: {
  topic: TopicOut;
  lessons: LessonOut[];
  subjectIcon: string | null;
  subjectId: number;
  lessonStudentsByLessonId: Map<number, SubjectLessonStudentOut[]>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const t = useTranslations("TutorSubjectDetail");
  const queryClient = useQueryClient();
  const deleteTopic = useDeleteTutorTopic();

  const handleDeleteTopic = () => {
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
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? t("expandTopicButton") : t("collapseTopicButton")}
          className="flex min-w-0 flex-1 items-center gap-1 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {collapsed ? (
            <ChevronRight className="size-4 shrink-0 text-gray-400" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-gray-400" aria-hidden="true" />
          )}
          <h3 className="m-0 truncate text-sm font-bold text-gray-700">{topic.title}</h3>
        </button>
        <button
          type="button"
          onClick={handleDeleteTopic}
          disabled={deleteTopic.isPending}
          title={t("deleteTopicButton")}
          aria-label={t("deleteTopicButton")}
          className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {deleteTopic.isError && <p className="text-xs text-red-600">{t("deleteTopicError")}</p>}
      {collapsed ? null : lessons.length === 0 ? (
        <p className="text-xs text-gray-400">{t("noLessonsInTopic")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {lessons.map((lesson, index) => (
            <PreschoolPreviewLessonTile
              key={lesson.id}
              lesson={lesson}
              index={index}
              subjectIcon={subjectIcon}
              subjectId={subjectId}
              isAssigned={(lessonStudentsByLessonId.get(lesson.id)?.length ?? 0) > 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// The tutor's "Preschool Preview" tab (Subject detail page) — lets a tutor
// see how their curriculum renders on a preschool-mode student's subject
// screen (preschool-subject-detail-page.tsx) without needing a student
// account, grouped by block then topic like the Lessons tab (every topic
// shown, even empty ones — unlike the real student screen, which flattens
// topics away and hides completed/not-yet-assigned lessons: a tutor
// previewing the whole subject wants to see everything, curriculum-
// shaped, not one student's current state). Each tile/topic still carries
// its own delete button (see PreschoolPreviewLessonTile/
// PreschoolPreviewTopicSection) so this doubles as a genuinely usable
// preschool-styled management view, not just a static mockup.
export function PreschoolPreviewTab({
  subject,
  topics,
  lessons,
  lessonStudentsByLessonId,
}: {
  subject: SubjectOut;
  topics: TopicOut[];
  lessons: LessonOut[];
  lessonStudentsByLessonId: Map<number, SubjectLessonStudentOut[]>;
}) {
  const t = useTranslations("TutorSubjectDetail");

  const lessonsByTopicId = useMemo(() => {
    const map = new Map<number, LessonOut[]>();
    for (const lesson of lessons) {
      const list = map.get(lesson.topic_id) ?? [];
      list.push(lesson);
      map.set(lesson.topic_id, list);
    }
    return map;
  }, [lessons]);

  const blockGroups = useMemo(() => groupTopicsByBlock(topics, subject.blocks), [topics, subject.blocks]);

  // Per-semester and per-topic collapse — absent from the set means
  // expanded (same convention as the Lessons tab, tutor-subject-detail-
  // page.tsx). Local to this tab, not shared with that one.
  const [collapsedBlockKeys, setCollapsedBlockKeys] = useState<Set<string>>(new Set());
  const [collapsedTopicIds, setCollapsedTopicIds] = useState<Set<number>>(new Set());
  const toggleIn = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
      <div className="pointer-events-none absolute inset-0">
        <Cloud className="left-6 top-4 h-8 w-14 opacity-90" />
        <Cloud className="right-8 top-8 h-6 w-12 opacity-70" />
        <Sun className="right-12 top-4 h-10 w-10" />
      </div>
      <div className="relative flex flex-col gap-4 p-4 sm:p-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-3xl bg-white/90 p-4 shadow-xl sm:p-6">
          {topics.length === 0 ? (
            <p className="text-center text-sm font-medium text-gray-500">{t("preschoolPreviewEmpty")}</p>
          ) : (
            blockGroups.map((group) => {
              const blockCollapsed = collapsedBlockKeys.has(group.key);
              return (
                <div key={group.key} className="flex flex-col gap-4">
                  {group.label && (
                    <button
                      type="button"
                      onClick={() => setCollapsedBlockKeys((prev) => toggleIn(prev, group.key))}
                      aria-expanded={!blockCollapsed}
                      title={blockCollapsed ? t("expandSemesterButton") : t("collapseSemesterButton")}
                      className="flex w-fit items-center gap-1 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      {blockCollapsed ? (
                        <ChevronRight className="size-5 shrink-0 text-gray-400" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="size-5 shrink-0 text-gray-400" aria-hidden="true" />
                      )}
                      <h2 className="m-0 text-lg font-bold text-gray-900">🎒 {group.label}</h2>
                    </button>
                  )}
                  {!blockCollapsed &&
                    group.topics.map((topic) => (
                      <PreschoolPreviewTopicSection
                        key={topic.id}
                        topic={topic}
                        lessons={lessonsByTopicId.get(topic.id) ?? []}
                        subjectIcon={subject.icon}
                        subjectId={subject.id}
                        lessonStudentsByLessonId={lessonStudentsByLessonId}
                        collapsed={collapsedTopicIds.has(topic.id)}
                        onToggleCollapsed={() => setCollapsedTopicIds((prev) => toggleIn(prev, topic.id))}
                      />
                    ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
