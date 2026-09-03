"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Monitor } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useGetSubject, useListSubjectTopics } from "@/lib/api/browser/academics/academics";
import {
  useGetNextLesson,
  useGetSubjectProgress,
  useListStudentSubjectLessons,
} from "@/lib/api/browser/student-lessons/student-lessons";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { ProgressBar } from "@/components/progress-bar";
import { Tabs } from "@/components/tabs";
import { SemesterPlan } from "@/components/subjects/semester-plan";
import { LESSON_TYPE_ICON, LESSON_TYPE_ICON_COLOR } from "@/components/simple/lesson-type-icon";
import { formatGradeLabel, formatShortDate, resolveStatusLabel } from "@/components/simple/format";
import { SimplePageContainer } from "@/components/simple/page-container";
import { StatusBadge } from "@/components/status-badge";
import type { SubjectLessonOut, TopicOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

// One lesson row inside a topic section — monochrome, tiny grey icon, plain
// text meta (date/status/grade) instead of TopicAccordionItem's colored
// left-border Card and status/grade pill badges. An unassigned lesson (no
// StudentLesson row yet) still shows so a student can see what's coming,
// but renders unlinked and dimmed, same as the Standard view's LessonRow.
// `colorful` (Default mode) colors the lesson-type icon and shows status as
// a small colored badge instead of plain grey text.
function SimpleSubjectLessonRow({ lesson, colorful }: { lesson: SubjectLessonOut; colorful?: boolean }) {
  const t = useTranslations("LessonWizard");
  const tStatus = useTranslations("LessonStatus");
  const tDetail = useTranslations("SubjectDetail");
  const Icon = LESSON_TYPE_ICON[lesson.lesson_type] ?? Monitor;
  const iconColorClass = colorful ? (LESSON_TYPE_ICON_COLOR[lesson.lesson_type] ?? "text-gray-400") : "text-gray-400";
  const isAssigned = lesson.student_lesson_id !== null;

  // Bare points (no "/12" denominator) — same compact-chip convention as
  // the Simple calendar/dashboard rows.
  const gradeLabel = formatGradeLabel({
    gradePoints: lesson.grade_points,
    gradeResult: lesson.grade_result,
    t,
    bare: true,
  });

  const statusLabel = isAssigned && lesson.status && !colorful ? resolveStatusLabel(lesson.status, tStatus) : null;
  const metaParts = [
    lesson.scheduled_date ? formatShortDate(lesson.scheduled_date) : null,
    isAssigned ? statusLabel : tDetail("notAssignedYet"),
    isAssigned ? gradeLabel : null,
  ].filter(Boolean);

  const content = (
    <>
      <Icon className={`size-3.5 shrink-0 ${iconColorClass}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{lesson.title}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {metaParts.length > 0 && (
          <span className="truncate text-[11px] text-gray-400">{metaParts.join(" · ")}</span>
        )}
        {colorful && isAssigned && lesson.status && <StatusBadge status={lesson.status} small />}
      </span>
    </>
  );

  if (!isAssigned) {
    return <li className="flex items-center gap-2 rounded px-1.5 py-1 opacity-60">{content}</li>;
  }

  return (
    <li>
      <Link
        href={`/lessons/${lesson.student_lesson_id}`}
        className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-gray-50"
      >
        {content}
      </Link>
    </li>
  );
}

function SimpleTopicSection({
  topic,
  lessons,
  colorful,
}: {
  topic: TopicOut;
  lessons: SubjectLessonOut[];
  colorful?: boolean;
}) {
  const t = useTranslations("SubjectDetail");

  return (
    <div className="flex flex-col gap-1">
      <div className="px-1.5 text-xs font-medium text-gray-500">{topic.title}</div>
      {lessons.length === 0 ? (
        <p className="px-4 text-xs text-gray-400">{t("noLessonsInTopic")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-50 pl-3">
          {lessons.map((lesson) => (
            <SimpleSubjectLessonRow key={lesson.id} lesson={lesson} colorful={colorful} />
          ))}
        </ul>
      )}
    </div>
  );
}

// The one Subject detail component for every student role/mode — a flat,
// always-expanded, borderless topic/lesson list instead of the (now-
// deleted) Standard view's accordion, per-block progress bars, deep-link-
// scroll, and description/resources panels. `colorful` (Default mode)
// restores a course-achievement badge, colored lesson-type icons, colored
// status badges, and a colored progress bar; Simple mode keeps everything
// monochrome. Both modes keep a Lessons/Plan tab split (the one piece of
// Standard's tab structure that's still worth having) — the Plan tab reuses
// the same `SemesterPlan` the tutor's own Subject detail page uses. See the
// Settings page's "Вигляд" section (components/settings/view-settings.tsx).
export function SimpleSubjectDetailPage({ subjectId, colorful }: { subjectId: number; colorful?: boolean }) {
  const t = useTranslations("SubjectDetail");

  const subjectQuery = useGetSubject(subjectId);
  const progressQuery = useGetSubjectProgress(subjectId);
  const topicsQuery = useListSubjectTopics(subjectId);
  const lessonsQuery = useListStudentSubjectLessons(subjectId);
  const nextLessonQuery = useGetNextLesson(subjectId);

  const topics = useMemo(() => topicsQuery.data ?? [], [topicsQuery.data]);
  const lessons = useMemo(() => lessonsQuery.data ?? [], [lessonsQuery.data]);
  const lessonsByTopicId = useMemo(() => {
    const map = new Map<number, SubjectLessonOut[]>();
    for (const lesson of lessons) {
      const list = map.get(lesson.topic_id) ?? [];
      list.push(lesson);
      map.set(lesson.topic_id, list);
    }
    return map;
  }, [lessons]);

  if (subjectQuery.isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (subjectQuery.isError || !subjectQuery.data) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  const subject = subjectQuery.data;
  const percent = Math.round(Math.min(100, Math.max(0, progressQuery.data?.completed_percent ?? 0)));
  const nextLesson = nextLessonQuery.data;

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("breadcrumbMySubjects"), href: "/subjects" },
    { label: subject.name },
  ];

  const isLoadingLessons = topicsQuery.isLoading || lessonsQuery.isLoading;
  const isErrorLessons = topicsQuery.isError || lessonsQuery.isError;

  return (
    <SimplePageContainer>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Breadcrumbs items={breadcrumbItems} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{subject.name}</h1>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{percent}%</span>
            </div>
          </div>
          <ProgressBar percent={percent} compact colorful={colorful} />
          {subject.teacher_name && (
            <p className="text-xs text-gray-500">
              {t("teacherLabel")}: {subject.teacher_name}
            </p>
          )}
        </div>

        <Tabs
          tabs={[
            {
              value: "lessons",
              label: t("lessonsTab"),
              content: (
                <div className="flex flex-col gap-5">
                  {nextLesson && (
                    <div className="flex flex-col gap-1">
                      <span className="px-1.5 text-xs font-medium text-gray-500">{t("nextLessonLabel")}</span>
                      <Link
                        href={`/lessons/${nextLesson.id}`}
                        className="flex items-center justify-between gap-3 rounded px-1.5 py-1 hover:bg-gray-50"
                      >
                        <span className="min-w-0 truncate text-sm text-gray-900">
                          {nextLesson.topic_title} · {nextLesson.title}
                        </span>
                        <span className="shrink-0 text-xs text-gray-400">
                          {formatShortDate(nextLesson.scheduled_date)}
                        </span>
                      </Link>
                    </div>
                  )}

                  <div className="flex flex-col gap-5">
                    {isLoadingLessons && <p className="text-sm text-gray-500">{t("loading")}</p>}
                    {isErrorLessons && <p className="text-sm text-red-600">{t("error")}</p>}
                    {!isLoadingLessons && !isErrorLessons && topics.length === 0 && (
                      <p className="text-sm text-gray-500">{t("noTopics")}</p>
                    )}
                    {topics.map((topic) => (
                      <SimpleTopicSection
                        key={topic.id}
                        topic={topic}
                        lessons={lessonsByTopicId.get(topic.id) ?? []}
                        colorful={colorful}
                      />
                    ))}
                  </div>
                </div>
              ),
            },
            {
              value: "plan",
              label: t("planTab"),
              content: <SemesterPlan subjectId={subjectId} />,
            },
          ]}
        />
      </div>
    </SimplePageContainer>
  );
}
