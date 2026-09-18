"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, FileText, ListChecks, Monitor, Star } from "lucide-react";
import { useAuthStore } from "@school-ahead/api-client";
import { Cloud, Raccoon, Sun } from "@school-ahead/preschool-ui";
import { AvatarBadge, useEquippedAvatarLayers } from "@school-ahead/avatar";
import { Link } from "@/i18n/navigation";
import { useGetSubject, useListSubjectTopics } from "@school-ahead/api-client/browser/academics/academics";
import { useGetSubjectProgress, useListStudentSubjectLessons } from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import type { SubjectLessonOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { groupTopicsByBlock } from "@/components/subjects/group-topics-by-block";
import { ProgressBar } from "@/components/progress-bar";

// Per-type icon, mirroring components/simple/lesson-type-icon.tsx's map —
// kept local (not imported) since this card always renders it in white on
// a colored gradient, never the grey/colorful variants that map's own
// LESSON_TYPE_ICON_COLOR covers.
const LESSON_TYPE_ICON = {
  theory: Monitor,
  with_task: FileText,
  with_quiz: ListChecks,
} as const;

// One gradient per card, cycled by position within its block — the "candy
// shelf" palette from the preschool subject-detail mock (pink, sky, amber,
// emerald, violet, repeating), distinct from BOOK_COLORS in
// subjects-shelf.tsx (top-to-bottom book covers, not a grid of cards).
const CARD_GRADIENTS = [
  "from-rose-400 to-rose-600",
  "from-sky-400 to-sky-600",
  "from-amber-400 to-amber-500",
  "from-emerald-400 to-emerald-600",
  "from-violet-400 to-violet-600",
  "from-pink-400 to-pink-600",
];

// The student's dressed companion — same CompanionAvatar idiom as
// game-map.tsx/calendar-view.tsx (preschool-ui), just kept local here since
// this is the only app-side preschool screen that needs it.
function CompanionAvatar({ className }: { className: string }) {
  const layers = useEquippedAvatarLayers();
  return <AvatarBadge layers={layers} className={className} fallback={<Raccoon mood="happy" className={className} />} />;
}

interface FlatLesson {
  lesson: SubjectLessonOut;
  topicTitle: string;
}

function PreschoolLessonCard({ entry, index }: { entry: FlatLesson; index: number }) {
  const t = useTranslations("PreschoolSubjectDetail");
  const { lesson, topicTitle } = entry;
  const isAssigned = lesson.student_lesson_id !== null;
  const href = isAssigned ? `/lessons/${lesson.student_lesson_id}` : `/lessons/preview/${lesson.id}`;
  const Icon = LESSON_TYPE_ICON[lesson.lesson_type as keyof typeof LESSON_TYPE_ICON] ?? Monitor;
  const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length];

  return (
    <Link
      href={href}
      className={`group flex flex-col gap-2 rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg transition-transform hover:-translate-y-1 active:scale-95 ${gradient}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/25">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="w-fit rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
        {t("lessonBadge", { index: index + 1 })}
      </span>
      <span className="text-base font-extrabold leading-tight">{lesson.title}</span>
      {topicTitle && <span className="truncate text-xs font-medium text-white/80">{topicTitle}</span>}
    </Link>
  );
}

function PreschoolBlockSection({
  label,
  entries,
}: {
  label: string | null;
  entries: FlatLesson[];
}) {
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {label && <h2 className="text-lg font-bold text-gray-900">🎒 {label}</h2>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {entries.map((entry, index) => (
          <PreschoolLessonCard key={entry.lesson.id} entry={entry} index={index} />
        ))}
      </div>
    </div>
  );
}

// Subject detail screen for `interfaceMode === "preschool"` — a bookshelf
// (subjects-shelf.tsx) leads here via the same `/subjects/[id]` URL every
// other mode uses (see subject-detail-page.tsx). Trades the tabbed,
// text-heavy SimpleSubjectDetailPage for one flat grid of big colorful
// lesson cards, grouped by SubjectBlock — no Tasks/Plan/Materials/Cards
// tabs, those stay behind in the grown-up view. See docs/views/preschool/README.md.
export function PreschoolSubjectDetailPage({ subjectId }: { subjectId: number }) {
  const t = useTranslations("PreschoolSubjectDetail");
  const canDoAnyLesson = useAuthStore((state) => state.user?.canDoAnyLesson ?? false);

  const subjectQuery = useGetSubject(subjectId);
  const progressQuery = useGetSubjectProgress(subjectId);
  const topicsQuery = useListSubjectTopics(subjectId);
  const lessonsQuery = useListStudentSubjectLessons(subjectId);

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

  const isLoading = subjectQuery.isLoading || topicsQuery.isLoading || lessonsQuery.isLoading;
  const isError = subjectQuery.isError || topicsQuery.isError || lessonsQuery.isError;

  const content = (() => {
    if (isLoading) {
      return <p className="text-center text-sm font-medium text-emerald-800">{t("loading")}</p>;
    }
    if (isError || !subjectQuery.data) {
      return <p className="text-center text-sm font-medium text-red-700">{t("error")}</p>;
    }

    const subject = subjectQuery.data;
    const percent = Math.round(Math.min(100, Math.max(0, progressQuery.data?.completed_percent ?? 0)));
    const points = progressQuery.data?.completed_count ?? 0;
    const blockGroups = groupTopicsByBlock(topics, subject.blocks);

    // A lesson without a StudentLesson yet only shows when the student is
    // allowed to start any lesson themselves (StudentProfile.can_do_any_lesson
    // — same rule as SimpleSubjectLessonRow); a finished one never shows at
    // all here, unlike the grown-up view which keeps it (greyed) for
    // history — this screen is "what can I do right now", not a log.
    const visibleEntriesByBlock = blockGroups.map((group) => {
      const entries: FlatLesson[] = [];
      for (const topic of group.topics) {
        for (const lesson of lessonsByTopicId.get(topic.id) ?? []) {
          const isAssigned = lesson.student_lesson_id !== null;
          if (isAssigned && lesson.status === "completed") continue;
          if (!isAssigned && !canDoAnyLesson) continue;
          entries.push({ lesson, topicTitle: topic.title });
        }
      }
      return { group, entries };
    });

    const hasAnyVisibleLesson = visibleEntriesByBlock.some(({ entries }) => entries.length > 0);

    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-3xl bg-white/90 p-4 shadow-xl sm:p-6">
        <div className="flex flex-col gap-3">
          <Link
            href="/subjects"
            className="flex w-fit items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {t("backToShelf")}
          </Link>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-white shadow">
                <Star className="size-6 fill-white" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1">
                <span className="w-fit rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sky-700">
                  {subject.class_name}
                </span>
                <h1 className="text-xl font-extrabold text-purple-800 sm:text-2xl">{subject.name} ✨</h1>
              </div>
            </div>

            <span className="flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-rose-100 px-4 py-2 text-sm font-bold text-rose-700">
              <Star className="size-4 fill-rose-500 text-rose-500" aria-hidden="true" />
              {t("pointsLabel", { count: points })}
            </span>
          </div>

          <div className="border-t border-dashed border-gray-200 pt-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="w-full sm:max-w-xs">
                <ProgressBar percent={percent} compact colorful />
              </div>
              <span className="text-xs font-medium text-gray-500">
                {t("courseProgressLabel", {
                  percent,
                  completed: progressQuery.data?.completed_count ?? 0,
                  total: progressQuery.data?.total_count ?? 0,
                })}
              </span>
            </div>
          </div>
        </div>

        {hasAnyVisibleLesson ? (
          <>
            <p className="text-sm font-medium text-gray-500">{t("chooseLessonHint")}</p>
            <div className="flex flex-col gap-6">
              {visibleEntriesByBlock.map(({ group, entries }) => (
                <PreschoolBlockSection key={group.key} label={group.label} entries={entries} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-center text-sm font-medium text-gray-500">{t("noLessons")}</p>
        )}

        <div className="relative -mb-2 -mt-2 flex justify-start pl-2">
          <CompanionAvatar className="h-20 w-20" />
        </div>
      </div>
    );
  })();

  return (
    <div className="relative flex flex-1 flex-col bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
      <div className="pointer-events-none absolute inset-0">
        <Cloud className="left-6 top-4 h-8 w-14 opacity-90" />
        <Cloud className="right-8 top-8 h-6 w-12 opacity-70" />
        <Sun className="right-12 top-4 h-10 w-10" />
      </div>
      <div className="relative flex flex-1 flex-col p-4 sm:p-6">{content}</div>
    </div>
  );
}
