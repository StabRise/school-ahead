"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { FileText, ListChecks, Monitor, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useGetSubject, useListSubjectTopics } from "@/lib/api/browser/academics/academics";
import {
  useGetNextLesson,
  useGetSubjectProgress,
  useListStudentSubjectLessons,
} from "@/lib/api/browser/student-lessons/student-lessons";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { STATUS_LABEL_KEY } from "@/components/status-badge";
import type { SubjectLessonOut, TopicOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

const LESSON_TYPE_ICON: Record<string, LucideIcon> = {
  theory: Monitor,
  with_task: FileText,
  with_quiz: ListChecks,
};

const SCHEDULED_DATE_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });

// One lesson row inside a topic section — monochrome, tiny grey icon, plain
// text meta (date/status/grade) instead of TopicAccordionItem's colored
// left-border Card and status/grade pill badges. An unassigned lesson (no
// StudentLesson row yet) still shows so a student can see what's coming,
// but renders unlinked and dimmed, same as the Standard view's LessonRow.
function SimpleSubjectLessonRow({ lesson }: { lesson: SubjectLessonOut }) {
  const t = useTranslations("LessonWizard");
  const tStatus = useTranslations("LessonStatus");
  const tDetail = useTranslations("SubjectDetail");
  const Icon = LESSON_TYPE_ICON[lesson.lesson_type] ?? Monitor;
  const isAssigned = lesson.student_lesson_id !== null;

  // Bare points (no "/12" denominator) — same compact-chip convention as
  // the Simple calendar/dashboard rows.
  const gradeLabel =
    lesson.grade_result === "pass"
      ? t("scorePass")
      : lesson.grade_result === "fail"
        ? t("scoreFail")
        : lesson.grade_points !== null
          ? String(lesson.grade_points)
          : null;

  const statusLabel =
    isAssigned && lesson.status ? tStatus(STATUS_LABEL_KEY[lesson.status] ?? STATUS_LABEL_KEY.assigned) : null;
  const metaParts = [
    lesson.scheduled_date ? SCHEDULED_DATE_FORMAT.format(new Date(`${lesson.scheduled_date}T00:00:00`)) : null,
    isAssigned ? statusLabel : tDetail("notAssignedYet"),
    isAssigned ? gradeLabel : null,
  ].filter(Boolean);

  const content = (
    <>
      <Icon className="size-3.5 shrink-0 text-gray-400" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{lesson.title}</span>
      <span className="shrink-0 truncate text-[11px] text-gray-400">{metaParts.join(" · ")}</span>
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

function SimpleTopicSection({ topic, lessons }: { topic: TopicOut; lessons: SubjectLessonOut[] }) {
  const t = useTranslations("SubjectDetail");

  return (
    <div className="flex flex-col gap-1">
      <div className="px-1.5 text-xs font-medium text-gray-500">{topic.title}</div>
      {lessons.length === 0 ? (
        <p className="px-4 text-xs text-gray-400">{t("noLessonsInTopic")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-50 pl-3">
          {lessons.map((lesson) => (
            <SimpleSubjectLessonRow key={lesson.id} lesson={lesson} />
          ))}
        </ul>
      )}
    </div>
  );
}

// Notion-style, monochrome alternative to the Standard SubjectDetailPage —
// same data (subject header, progress, next lesson, topics/lessons), but a
// flat, always-expanded, borderless layout instead of tabs, colored status
// pills, and an accordion. The about/resources panels and the Semester
// Plan tab are dropped, same way the Simple dashboard drops its sidebar —
// they clash with the monochrome ask and aren't essential to "see my
// lessons". See the Settings page's "Вигляд" section
// (components/settings/view-settings.tsx).
export function SimpleSubjectDetailPage({ subjectId }: { subjectId: number }) {
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{subject.name}</h1>
          <span className="text-xs text-gray-500">{percent}%</span>
        </div>
        <span className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <span className="block h-full rounded-full bg-gray-900" style={{ width: `${percent}%` }} />
        </span>
        {subject.teacher_name && (
          <p className="text-xs text-gray-500">
            {t("teacherLabel")}: {subject.teacher_name}
          </p>
        )}
      </div>

      {nextLesson && (
        <div className="flex flex-col gap-1 border-t border-gray-100 pt-4">
          <span className="px-1.5 text-xs font-medium text-gray-500">{t("nextLessonLabel")}</span>
          <Link
            href={`/lessons/${nextLesson.id}`}
            className="flex items-center justify-between gap-3 rounded px-1.5 py-1 hover:bg-gray-50"
          >
            <span className="min-w-0 truncate text-sm text-gray-900">
              {nextLesson.topic_title} · {nextLesson.title}
            </span>
            <span className="shrink-0 text-xs text-gray-400">
              {SCHEDULED_DATE_FORMAT.format(new Date(`${nextLesson.scheduled_date}T00:00:00`))}
            </span>
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-5 border-t border-gray-100 pt-4">
        {isLoadingLessons && <p className="text-sm text-gray-500">{t("loading")}</p>}
        {isErrorLessons && <p className="text-sm text-red-600">{t("error")}</p>}
        {!isLoadingLessons && !isErrorLessons && topics.length === 0 && (
          <p className="text-sm text-gray-500">{t("noTopics")}</p>
        )}
        {topics.map((topic) => (
          <SimpleTopicSection key={topic.id} topic={topic} lessons={lessonsByTopicId.get(topic.id) ?? []} />
        ))}
      </div>
    </div>
  );
}
