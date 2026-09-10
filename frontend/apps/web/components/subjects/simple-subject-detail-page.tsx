"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Monitor, Pencil, Play, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useGetSubject, useListSubjectTopics } from "@school-ahead/api-client/browser/academics/academics";
import {
  useGetNextLesson,
  useGetSubjectProgress,
  useListStudentSubjectLessons,
} from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import { useGetSubjectTaskProgress, useListSubjectTasks } from "@school-ahead/api-client/browser/tasks/tasks";
import {
  useGetMyCardSet,
  useListMyCardSets,
  useUpdateStudentCardTranslation,
} from "@school-ahead/api-client/browser/cards/cards";
import type { CardSetSummaryOut, StudentCardOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { ProgressBar } from "@/components/progress-bar";
import { Tabs } from "@/components/tabs";
import { SemesterPlan } from "@/components/subjects/semester-plan";
import { SubjectMaterials } from "@/components/subjects/subject-materials";
import { groupTasksByTopicId, TaskListSection } from "@/components/subjects/task-list";
import { LESSON_TYPE_ICON, LESSON_TYPE_ICON_COLOR } from "@/components/simple/lesson-type-icon";
import { formatGradeLabel, formatShortDate, resolveStatusLabel } from "@/components/simple/format";
import { SimplePageContainer } from "@/components/simple/page-container";
import { StatusBadge } from "@/components/status-badge";
import type { SubjectLessonOut, TopicOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

// The Tasks tab's content — topic-grouped optional practice work a tutor
// attached to the subject, available to every student immediately (no
// per-student assignment, unlike Lessons). One overall progress bar (done
// task count / total), same idiom as the header's lesson progress bar.
function TasksTabContent({
  subjectId,
  topics,
  colorful,
}: {
  subjectId: number;
  topics: TopicOut[];
  colorful?: boolean;
}) {
  const t = useTranslations("SubjectDetail");
  const tasksQuery = useListSubjectTasks(subjectId);
  const progressQuery = useGetSubjectTaskProgress(subjectId);

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const tasksByTopicId = useMemo(() => groupTasksByTopicId(tasks), [tasks]);
  const percent = Math.round(Math.min(100, Math.max(0, progressQuery.data?.completed_percent ?? 0)));

  if (tasksQuery.isLoading) {
    return <p className="text-sm text-gray-500">{t("loading")}</p>;
  }
  if (tasksQuery.isError) {
    return <p className="text-sm text-red-600">{t("error")}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {tasks.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">
            {t("tasksProgress", {
              completed: progressQuery.data?.completed_count ?? 0,
              total: progressQuery.data?.total_count ?? 0,
            })}
          </span>
          <ProgressBar percent={percent} compact colorful={colorful} />
        </div>
      )}

      {topics.length === 0 ? (
        <p className="text-sm text-gray-500">{t("noTopics")}</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-gray-500">{t("noTasks")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {topics.map((topic) => (
            <TaskListSection
              key={topic.id}
              topic={topic}
              tasks={tasksByTopicId.get(topic.id) ?? []}
              emptyLabel={t("noTasksInTopic")}
              getHref={(task) => `/tasks/${task.id}`}
              doneToggle={{
                subjectId,
                markDoneLabel: t("markDoneButton"),
                markNotDoneLabel: t("markNotDoneButton"),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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

// One saved card (term + translation) within a lesson's personal-cards
// list — mirrors DictionaryItemRow's inline-edit-translation pattern
// exactly (dictionary-page.tsx), backed by the same kind of endpoint
// (cards/api.py::update_card_translation).
function CardsCardRow({ card }: { card: StudentCardOut }) {
  const t = useTranslations("SubjectDetail");
  const updateTranslation = useUpdateStudentCardTranslation();
  const [editing, setEditing] = useState(false);
  const [draftTranslation, setDraftTranslation] = useState(card.translation);

  const startEditing = () => {
    setDraftTranslation(card.translation);
    setEditing(true);
  };
  const cancelEditing = () => setEditing(false);
  const saveTranslation = () => {
    const translation = draftTranslation.trim();
    if (!translation || updateTranslation.isPending) return;
    updateTranslation.mutate(
      { cardId: card.id, data: { translation } },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <li className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-gray-50">
      <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{card.term}</span>
      {editing ? (
        <span className="flex shrink-0 items-center gap-1">
          <input
            value={draftTranslation}
            onChange={(event) => setDraftTranslation(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveTranslation();
              if (event.key === "Escape") cancelEditing();
            }}
            autoFocus
            className="w-28 rounded-md border border-gray-300 px-2 py-0.5 text-xs focus:border-gray-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={saveTranslation}
            disabled={updateTranslation.isPending || !draftTranslation.trim()}
            aria-label={t("saveButton")}
            title={t("saveButton")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-green-600 disabled:opacity-50"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            aria-label={t("cancelButton")}
            title={t("cancelButton")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-xs text-gray-500">{card.translation}</span>
          <button
            type="button"
            onClick={startEditing}
            aria-label={t("editButton")}
            title={t("editButton")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <Pencil className="size-3.5" />
          </button>
        </span>
      )}
    </li>
  );
}

// One Lesson (category) section within a topic's own personal-cards
// section — mirrors SimpleSubjectLessonRow's header shape (icon + truncated
// title + a small grey meta cluster) but shows a card count instead of
// status/grade, and a play icon-button (not the row's own link) deep-
// linking into the Cards game filtered to just this lesson's category (see
// flashcard-game-page.tsx's ?topic= support) — followed by the lesson's
// actual saved cards, each inline-editable via CardsCardRow.
function CardsTopicLessonRow({
  title,
  items,
  groupSlug,
  setSlug,
}: {
  title: string;
  items: StudentCardOut[];
  groupSlug: string;
  setSlug: string;
}) {
  const t = useTranslations("SubjectDetail");

  return (
    <li className="flex flex-col gap-1 py-1">
      <div className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-gray-50">
        <Play className="size-3.5 shrink-0 text-gray-400" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{title}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="text-[11px] text-gray-400">{t("cardsCount", { count: items.length })}</span>
          <Link
            href={`/games/cards/${encodeURIComponent(groupSlug)}/${encodeURIComponent(setSlug)}?topic=${encodeURIComponent(title)}`}
            aria-label={t("playCardsButton")}
            title={t("playCardsButton")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <Play className="size-3.5" />
          </Link>
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-gray-50 pl-6">
        {items.map((card) => (
          <CardsCardRow key={card.id} card={card} />
        ))}
      </ul>
    </li>
  );
}

// One Topic (set) section of the Cards tab — fetches its own lesson
// (category) breakdown via useGetMyCardSet since the summary list
// (useListMyCardSets) only carries topic-level aggregate counts, not the
// per-lesson list needed to render rows here.
function CardsTopicSection({ groupSlug, summary }: { groupSlug: string; summary: CardSetSummaryOut }) {
  const t = useTranslations("SubjectDetail");
  const setQuery = useGetMyCardSet(groupSlug, summary.slug);
  const categories = setQuery.data?.categories ?? [];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 px-1.5">
        <span className="text-xs font-medium text-gray-500">{summary.title}</span>
        <Link
          href={`/games/cards/${encodeURIComponent(groupSlug)}/${encodeURIComponent(summary.slug)}`}
          aria-label={t("playCardsButton")}
          title={t("playCardsButton")}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <Play className="size-3.5" />
        </Link>
      </div>
      {setQuery.isLoading ? (
        <p className="px-4 text-xs text-gray-400">{t("loading")}</p>
      ) : categories.length === 0 ? (
        <p className="px-4 text-xs text-gray-400">{t("noCardsInTopic")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-50 pl-3">
          {categories.map((category) => (
            <CardsTopicLessonRow
              key={category.title}
              title={category.title}
              items={category.items}
              groupSlug={groupSlug}
              setSlug={summary.slug}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// The Cards tab's content — the student's own personal flashcards (saved
// while translating a lesson's content/синопсис/матеріали, see
// translatable-content.tsx/read-along-content.tsx's "add to cards"
// button), grouped Subject → Topic → Lesson the same way the Cards game
// itself does (backend/cards/ reshapes this into the game's Group/Set/
// Category shape — see @school-ahead/flashcards' lib/flashcards.ts).
function CardsTabContent({ subjectId }: { subjectId: number }) {
  const t = useTranslations("SubjectDetail");
  const groupSlug = `subject-${subjectId}`;
  const setsQuery = useListMyCardSets(groupSlug);
  const sets = setsQuery.data ?? [];

  if (setsQuery.isLoading) {
    return <p className="text-sm text-gray-500">{t("loading")}</p>;
  }
  if (setsQuery.isError) {
    return <p className="text-sm text-red-600">{t("error")}</p>;
  }
  if (sets.length === 0) {
    return <p className="text-sm text-gray-500">{t("noCards")}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {sets.map((set) => (
        <CardsTopicSection key={set.slug} groupSlug={groupSlug} summary={set} />
      ))}
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
              value: "tasks",
              label: t("tasksTab"),
              content: <TasksTabContent subjectId={subjectId} topics={topics} colorful={colorful} />,
            },
            {
              value: "plan",
              label: t("planTab"),
              content: <SemesterPlan subjectId={subjectId} />,
            },
            {
              value: "materials",
              label: t("materialsTab"),
              content: <SubjectMaterials subjectId={subjectId} />,
            },
            {
              value: "cards",
              label: t("cardsTab"),
              content: <CardsTabContent subjectId={subjectId} />,
            },
          ]}
        />
      </div>
    </SimplePageContainer>
  );
}
