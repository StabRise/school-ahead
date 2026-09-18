"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Cloud, Sun } from "@school-ahead/preschool-ui";
import type { LessonOut, SubjectOut, TopicOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { groupTopicsByBlock } from "@/components/subjects/group-topics-by-block";
import { PreschoolLessonTile } from "@/components/subjects/preschool-lesson-tile";

// Read-only stand-in for preschool-subject-detail-page.tsx's
// PreschoolBlockSection — same grid, just fed the tutor's own already-
// fetched LessonOut list (topic_title comes straight off it) instead of a
// FlatLesson built from the student-facing SubjectLessonOut.
function PreschoolPreviewBlockSection({
  label,
  lessons,
  subjectIcon,
}: {
  label: string | null;
  lessons: LessonOut[];
  subjectIcon: string | null;
}) {
  if (lessons.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {label && <h2 className="text-lg font-bold text-gray-900">🎒 {label}</h2>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {lessons.map((lesson, index) => (
          <PreschoolLessonTile
            key={lesson.id}
            icon={lesson.icon}
            subjectIcon={subjectIcon}
            lessonType={lesson.lesson_type}
            title={lesson.title}
            topicTitle={lesson.topic_title}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

// The tutor's "Preschool Preview" tab (Subject detail page) — lets a tutor
// see how their curriculum renders on a preschool-mode student's subject
// screen (preschool-subject-detail-page.tsx) without needing a student
// account. Read-only (tiles have no href — see PreschoolLessonTile) and
// shows every lesson in curriculum order, unlike the real student screen
// which hides completed/not-yet-assigned lessons: a tutor previewing the
// whole subject wants to see everything, not one student's current state.
export function PreschoolPreviewTab({
  subject,
  topics,
  lessons,
}: {
  subject: SubjectOut;
  topics: TopicOut[];
  lessons: LessonOut[];
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

  const lessonsByBlock = blockGroups.map((group) => ({
    group,
    lessons: group.topics.flatMap((topic) => lessonsByTopicId.get(topic.id) ?? []),
  }));

  const hasAnyLesson = lessons.length > 0;

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
      <div className="pointer-events-none absolute inset-0">
        <Cloud className="left-6 top-4 h-8 w-14 opacity-90" />
        <Cloud className="right-8 top-8 h-6 w-12 opacity-70" />
        <Sun className="right-12 top-4 h-10 w-10" />
      </div>
      <div className="relative flex flex-col gap-4 p-4 sm:p-6">
        <p className="text-xs font-medium text-emerald-900">{t("preschoolPreviewHint")}</p>

        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-3xl bg-white/90 p-4 shadow-xl sm:p-6">
          {hasAnyLesson ? (
            lessonsByBlock.map(({ group, lessons: blockLessons }) => (
              <PreschoolPreviewBlockSection
                key={group.key}
                label={group.label}
                lessons={blockLessons}
                subjectIcon={subject.icon}
              />
            ))
          ) : (
            <p className="text-center text-sm font-medium text-gray-500">{t("preschoolPreviewEmpty")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
