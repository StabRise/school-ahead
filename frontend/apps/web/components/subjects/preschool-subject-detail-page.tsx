"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { useAuthStore } from "@school-ahead/api-client";
import { Cloud, PreschoolButton, Raccoon, Sun } from "@school-ahead/preschool-ui";
import { AvatarBadge, useEquippedAvatarLayers } from "@school-ahead/avatar";
import { useGetSubject, useListSubjectTopics } from "@school-ahead/api-client/browser/academics/academics";
import { useGetSubjectProgress, useListStudentSubjectLessons } from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import type { SubjectLessonOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { groupTopicsByBlock } from "@/components/subjects/group-topics-by-block";
import { limitAcrossGroups } from "@/lib/limit-across-groups";
import { isLessonShown } from "@/lib/preschool-lessons-filter";
import { usePreschoolLessonsFilterStore } from "@/stores/preschool-lessons-filter-store";
import { PreschoolLessonTile } from "@/components/subjects/preschool-lesson-tile";
import { PreschoolLessonsFilterButton } from "@/components/subjects/preschool-lessons-filter-button";
import { ProgressBar } from "@/components/progress-bar";

// The student's dressed companion — same CompanionAvatar idiom as
// game-map.tsx/calendar-view.tsx (preschool-ui), just kept local here since
// this is the only app-side preschool screen that needs it.
function CompanionAvatar({ className }: { className: string }) {
  const layers = useEquippedAvatarLayers();
  return <AvatarBadge layers={layers} className={className} fallback={<Raccoon mood="happy" className={className} />} />;
}

// How many lesson cards show at first, and how many more each time the
// child scrolls near the bottom. The whole lesson list is still fetched in
// one request (a few hundred small rows) — this only limits what's rendered,
// which is what matters: every card loads its own thumbnail image, and a
// long YouTube-imported subject has hundreds of them.
const PAGE_SIZE = 20;

interface FlatLesson {
  lesson: SubjectLessonOut;
  topicTitle: string;
}

function PreschoolLessonCard({
  entry,
  index,
  subjectIcon,
}: {
  entry: FlatLesson;
  index: number;
  subjectIcon: string | null;
}) {
  const { lesson, topicTitle } = entry;
  const isAssigned = lesson.student_lesson_id !== null;
  const href = isAssigned ? `/lessons/${lesson.student_lesson_id}` : `/lessons/preview/${lesson.id}`;

  return (
    <PreschoolLessonTile
      href={href}
      icon={lesson.icon}
      subjectIcon={subjectIcon}
      lessonType={lesson.lesson_type}
      title={lesson.title}
      topicTitle={topicTitle}
      index={index}
    />
  );
}

function PreschoolBlockSection({
  label,
  entries,
  subjectIcon,
}: {
  label: string | null;
  entries: FlatLesson[];
  subjectIcon: string | null;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {label && <h2 className="text-lg font-bold text-gray-900">🎒 {label}</h2>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {entries.map((entry, index) => (
          <PreschoolLessonCard key={entry.lesson.id} entry={entry} index={index} subjectIcon={subjectIcon} />
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
  const locale = useLocale();
  const canDoAnyLesson = useAuthStore((state) => state.user?.canDoAnyLesson ?? false);
  const lessonsFilter = usePreschoolLessonsFilterStore((state) => state.filter);

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

  const subject = subjectQuery.data;

  // Which lessons make the cut is the child's own choice (the gear in the
  // header, remembered for every subject) — see lib/preschool-lessons-filter.ts.
  const visibleEntriesByBlock = useMemo(() => {
    if (!subject) return [];
    return groupTopicsByBlock(topics, subject.blocks).map((group) => {
      const entries: FlatLesson[] = [];
      for (const topic of group.topics) {
        for (const lesson of lessonsByTopicId.get(topic.id) ?? []) {
          const shown = isLessonShown(
            lessonsFilter,
            { isAssigned: lesson.student_lesson_id !== null, status: lesson.status, isFavorite: lesson.is_favorite },
            canDoAnyLesson,
          );
          if (shown) entries.push({ lesson, topicTitle: topic.title });
        }
      }
      return { group, entries };
    });
  }, [subject, topics, lessonsByTopicId, canDoAnyLesson, lessonsFilter]);

  const totalCount = useMemo(
    () => visibleEntriesByBlock.reduce((count, { entries }) => count + entries.length, 0),
    [visibleEntriesByBlock],
  );

  // Infinite scroll: render the first `visibleCount` cards (across block
  // sections), and reveal PAGE_SIZE more whenever the sentinel below the
  // list comes within ~a screen of the viewport. The observer is recreated
  // after every batch (`visibleCount` in the deps) — a fresh observer
  // reports the sentinel's current state right away, so if a batch didn't
  // push it out of range (tall screen), the next one loads without needing
  // a scroll.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const hasMore = totalCount > visibleCount;
  const shownEntriesByBlock = useMemo(
    () => limitAcrossGroups(visibleEntriesByBlock, visibleCount),
    [visibleEntriesByBlock, visibleCount],
  );
  useEffect(() => {
    if (!hasMore || !sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisibleCount((count) => count + PAGE_SIZE);
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, sentinel, visibleCount]);

  const isLoading = subjectQuery.isLoading || topicsQuery.isLoading || lessonsQuery.isLoading;
  const isError = subjectQuery.isError || topicsQuery.isError || lessonsQuery.isError;

  const content = (() => {
    if (isLoading) {
      return <p className="text-center text-sm font-medium text-emerald-800">{t("loading")}</p>;
    }
    if (isError || !subject) {
      return <p className="text-center text-sm font-medium text-red-700">{t("error")}</p>;
    }

    const percent = Math.round(Math.min(100, Math.max(0, progressQuery.data?.completed_percent ?? 0)));
    const points = progressQuery.data?.completed_count ?? 0;
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-3xl bg-white/90 p-4 shadow-xl sm:p-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Back to the shelf — a house button where the decorative star used to
                  be. PreschoolButton links with next/link, which knows nothing about
                  the locale, so the href carries it explicitly. */}
              <PreschoolButton
                href={`/${locale}/subjects`}
                icon="🏠"
                label={t("backToShelf")}
                ringColorClassName="ring-emerald-400"
                sizeClassName="h-14 w-14"
                position="static"
                className="shrink-0"
              />
              <div className="flex flex-col gap-1">
                <span className="w-fit rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sky-700">
                  {subject.class_name}
                </span>
                <h1 className="text-xl font-extrabold text-purple-800 sm:text-2xl">{subject.name} ✨</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-rose-100 px-4 py-2 text-sm font-bold text-rose-700">
                <Star className="size-4 fill-rose-500 text-rose-500" aria-hidden="true" />
                {t("pointsLabel", { count: points })}
              </span>
              <PreschoolLessonsFilterButton onChange={() => setVisibleCount(PAGE_SIZE)} />
            </div>
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

        {totalCount > 0 ? (
          <>
            <p className="text-sm font-medium text-gray-500">{t("chooseLessonHint")}</p>
            <div className="flex flex-col gap-6">
              {shownEntriesByBlock.map(({ group, entries }) => (
                <PreschoolBlockSection
                  key={group.key}
                  label={group.label}
                  entries={entries}
                  subjectIcon={subject.icon}
                />
              ))}
            </div>
            {hasMore && <div ref={setSentinel} aria-hidden="true" className="h-px" />}
          </>
        ) : (
          <p className="text-center text-sm font-medium text-gray-500">
            {lessonsFilter === "favorites" ? t("noFavorites") : t("noLessons")}
          </p>
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
