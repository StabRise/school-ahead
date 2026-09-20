"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useAuthStore } from "@school-ahead/api-client";
import { Cloud, PreschoolButton, Raccoon, Sun } from "@school-ahead/preschool-ui";
import { AvatarBadge, useEquippedAvatarLayers } from "@school-ahead/avatar";
import { useGetSubject, useListSubjectTopics } from "@school-ahead/api-client/browser/academics/academics";
import {
  useGetPublicSubject,
  useListPublicSubjectLessons,
  useListPublicSubjectTopics,
} from "@school-ahead/api-client/browser/public/public";
import {
  getGetNextLessonQueryKey,
  getGetSubjectProgressQueryKey,
  getListFavoriteSubjectIdsQueryKey,
  getListStudentSubjectLessonsQueryKey,
  useGetSubjectProgress,
  useListFavoriteSubjectIds,
  useListStudentSubjectLessons,
  useSetSubjectFavorite,
  useStartLessonToday,
} from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import { getGetTodayQueryKey } from "@school-ahead/api-client/browser/schedule/schedule";
import type {
  SubjectLessonOut,
  SubjectProgressOut,
  TopicOut,
} from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { isLessonShown } from "@/lib/preschool-lessons-filter";
import { useTabQueryParam } from "@/lib/use-tab-query-param";
import { usePreschoolLessonsFilterStore } from "@/stores/preschool-lessons-filter-store";
import { useRouter } from "@/i18n/navigation";
import { HeartIcon } from "@/components/preschool/heart-icon";
import { PreschoolLessonTile } from "@/components/subjects/preschool-lesson-tile";
import { PreschoolLessonsFilterButton } from "@/components/subjects/preschool-lessons-filter-button";
import { ProgressBar } from "@/components/progress-bar";
import { useDialogs } from "@/components/dialogs/app-dialogs";

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

interface TopicTab {
  topic: TopicOut;
  lessons: SubjectLessonOut[];
}

// A lesson the student has no StudentLesson for yet (only listed when they
// may start any lesson — StudentProfile.can_do_any_lesson). No preview page in
// preschool mode: tapping it creates today's StudentLesson right away (the
// same start-today call the preview's button makes) and opens it.
function StartLessonCard({
  lesson,
  index,
  subjectId,
  subjectIcon,
}: {
  lesson: SubjectLessonOut;
  index: number;
  subjectId: number;
  subjectIcon: string | null;
}) {
  const t = useTranslations("PreschoolSubjectDetail");
  const dialogs = useDialogs();
  const router = useRouter();
  const queryClient = useQueryClient();
  const startToday = useStartLessonToday();

  const handleStart = () => {
    if (startToday.isPending) return;
    startToday.mutate(
      { lessonId: lesson.id },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListStudentSubjectLessonsQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getGetNextLessonQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getGetSubjectProgressQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getGetTodayQueryKey() });
          router.push(`/lessons/${data.student_lesson_id}`);
        },
        onError: () => dialogs.error(t("startError")),
      },
    );
  };

  return (
    <PreschoolLessonTile
      onClick={handleStart}
      icon={lesson.icon}
      subjectIcon={subjectIcon}
      lessonType={lesson.lesson_type}
      title={lesson.title}
      index={index}
    />
  );
}

function PreschoolLessonCard({
  lesson,
  index,
  subjectId,
  subjectIcon,
  guest,
}: {
  lesson: SubjectLessonOut;
  index: number;
  subjectId: number;
  subjectIcon: string | null;
  guest: boolean;
}) {
  // A visitor who isn't signed in has no StudentLesson and can't start one —
  // a card just opens the read-only lesson (PreschoolPublicLessonView).
  if (guest) {
    return (
      <PreschoolLessonTile
        href={`/lessons/preview/${lesson.id}`}
        icon={lesson.icon}
        subjectIcon={subjectIcon}
        lessonType={lesson.lesson_type}
        title={lesson.title}
        index={index}
      />
    );
  }

  if (lesson.student_lesson_id === null) {
    return <StartLessonCard lesson={lesson} index={index} subjectId={subjectId} subjectIcon={subjectIcon} />;
  }

  return (
    <PreschoolLessonTile
      href={`/lessons/${lesson.student_lesson_id}`}
      icon={lesson.icon}
      subjectIcon={subjectIcon}
      lessonType={lesson.lesson_type}
      title={lesson.title}
      index={index}
    />
  );
}

// The heart beside the subject's name — marks (or unmarks) the subject as one
// of the child's favourites (FavoriteSubject), which is what the bookshelf's
// "favourites" view lists. Like the lesson screen's heart, it flips at once and
// is rolled back if the request fails: a child taps it and expects an instant
// answer, not a wait on the network. It edits the same cached list of favourite
// ids the bookshelf reads, so the shelf is up to date when they go back to it.
function FavoriteSubjectButton({ subjectId }: { subjectId: number }) {
  const t = useTranslations("PreschoolSubjectDetail");
  const queryClient = useQueryClient();
  const favorites = useListFavoriteSubjectIds();
  const setFavorite = useSetSubjectFavorite();
  const isFavorite = favorites.data?.includes(subjectId) ?? false;

  const showFavorite = (value: boolean) =>
    queryClient.setQueryData<number[]>(getListFavoriteSubjectIdsQueryKey(), (ids = []) =>
      value ? (ids.includes(subjectId) ? ids : [...ids, subjectId]) : ids.filter((id) => id !== subjectId),
    );

  const handleClick = () => {
    // Until the list has loaded we don't know which way the heart should flip.
    if (favorites.isLoading) return;
    const next = !isFavorite;
    showFavorite(next);
    setFavorite.mutate({ subjectId, data: { is_favorite: next } }, { onError: () => showFavorite(!next) });
  };

  return (
    <PreschoolButton
      icon={<HeartIcon filled={isFavorite} className="h-5 w-5" />}
      label={isFavorite ? t("favoriteSubjectRemoveLabel") : t("favoriteSubjectAddLabel")}
      ringColorClassName="ring-rose-400"
      position="static"
      className="shrink-0"
      onClick={handleClick}
    />
  );
}

// One topic per tab — big, colourful pills a child can tap, in a strip that
// scrolls sideways when a subject has more topics than fit (a YouTube-imported
// one can have dozens). Hand-rolled instead of components/tabs.tsx, whose
// small grey underline tabs are made for the grown-up views.
function PreschoolTopicTabs({
  tabs,
  activeId,
  onSelect,
}: {
  tabs: TopicTab[];
  activeId: number;
  onSelect: (topicId: number) => void;
}) {
  return (
    <div role="tablist" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
      {tabs.map(({ topic }) => {
        const isActive = topic.id === activeId;
        return (
          <button
            key={topic.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(topic.id)}
            // A long title is cut with "…" (the pill has a max width); the
            // native tooltip shows it in full.
            title={topic.title}
            className={`min-h-11 max-w-36 shrink-0 truncate rounded-full px-4 py-2 text-sm font-bold transition-colors sm:max-w-48 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 sm:text-base ${
              isActive ? "bg-purple-600 text-white shadow-md" : "bg-purple-100 text-purple-800 hover:bg-purple-200"
            }`}
          >
            {topic.title}
          </button>
        );
      })}
    </div>
  );
}

// Subject detail screen for `interfaceMode === "preschool"` — a bookshelf
// (subjects-shelf.tsx) leads here via the same `/subjects/[id]` URL every
// other mode uses (see subject-detail-page.tsx). Trades the tabbed,
// text-heavy SimpleSubjectDetailPage for one flat grid of big colorful
// lesson cards, one tab per topic (SubjectBlocks — "Semester 1" etc. — aren't
// shown) — no Tasks/Plan/Materials/Cards tabs, those stay behind in the
// grown-up view. See docs/views/preschool/README.md.
//
// The screen itself only draws what it's handed; the two exports below fetch
// it — a signed-in student's own data, or, for a visitor who isn't signed in,
// the public read-only copy (see docs/core/public_access.md).
function PreschoolSubjectScreen({
  subjectId,
  subject,
  topics: topicsData,
  lessons: lessonsData,
  progress,
  isLoading,
  isError,
  guest,
}: {
  subjectId: number;
  subject: { name: string; icon: string | null } | undefined;
  topics: TopicOut[] | undefined;
  lessons: SubjectLessonOut[] | undefined;
  progress: SubjectProgressOut | undefined;
  isLoading: boolean;
  isError: boolean;
  // A visitor who isn't signed in: no progress, points or lesson filter (there
  // is nothing of theirs to filter by), and a card just opens the lesson.
  guest: boolean;
}) {
  const t = useTranslations("PreschoolSubjectDetail");
  const locale = useLocale();
  const canDoAnyLesson = useAuthStore((state) => state.user?.canDoAnyLesson ?? false);
  const lessonsFilter = usePreschoolLessonsFilterStore((state) => state.filter);

  const topics = useMemo(() => topicsData ?? [], [topicsData]);
  const lessons = useMemo(() => lessonsData ?? [], [lessonsData]);
  const lessonsByTopicId = useMemo(() => {
    const map = new Map<number, SubjectLessonOut[]>();
    for (const lesson of lessons) {
      const list = map.get(lesson.topic_id) ?? [];
      list.push(lesson);
      map.set(lesson.topic_id, list);
    }
    return map;
  }, [lessons]);

  // Which lessons make the cut is the child's own choice (the gear in the
  // header, remembered for every subject) — see lib/preschool-lessons-filter.ts.
  // A topic with nothing left to show gets no tab, rather than an empty one.
  // A visitor who isn't signed in sees every lesson.
  const topicTabs = useMemo(() => {
    const tabs: TopicTab[] = [];
    for (const topic of topics) {
      const shownLessons = (lessonsByTopicId.get(topic.id) ?? []).filter(
        (lesson) =>
          guest ||
          isLessonShown(
            lessonsFilter,
            { isAssigned: lesson.student_lesson_id !== null, status: lesson.status, isFavorite: lesson.is_favorite },
            canDoAnyLesson,
          ),
      );
      if (shownLessons.length > 0) tabs.push({ topic, lessons: shownLessons });
    }
    return tabs;
  }, [topics, lessonsByTopicId, canDoAnyLesson, lessonsFilter, guest]);

  // The open topic lives in `?topic=<id>`, so coming back from a lesson (or a
  // reload) lands on the same tab. An id that has no tab (a stale link, or a
  // topic the filter just emptied) falls back to the first one.
  const [activeTopicParam, setActiveTopicParam] = useTabQueryParam(String(topicTabs[0]?.topic.id ?? ""), "topic");
  const activeTab = topicTabs.find(({ topic }) => String(topic.id) === activeTopicParam) ?? topicTabs[0];
  const activeLessons = activeTab?.lessons ?? [];

  // Infinite scroll: render the first `visibleCount` cards of the open topic,
  // and reveal PAGE_SIZE more whenever the sentinel below the list comes
  // within ~a screen of the viewport. The observer is recreated after every
  // batch (`visibleCount` in the deps) — a fresh observer reports the
  // sentinel's current state right away, so if a batch didn't push it out of
  // range (tall screen), the next one loads without needing a scroll.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const hasMore = activeLessons.length > visibleCount;
  const shownLessons = activeLessons.slice(0, visibleCount);
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

  const selectTopic = (topicId: number) => {
    setActiveTopicParam(String(topicId));
    setVisibleCount(PAGE_SIZE);
  };

  const content = (() => {
    if (isLoading) {
      return <p className="text-center text-sm font-medium text-emerald-800">{t("loading")}</p>;
    }
    if (isError || !subject) {
      return <p className="text-center text-sm font-medium text-red-700">{t("error")}</p>;
    }

    const percent = Math.round(Math.min(100, Math.max(0, progress?.completed_percent ?? 0)));
    const points = progress?.completed_count ?? 0;
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
                position="static"
                className="shrink-0"
              />
              <h1 className="text-xl font-extrabold text-purple-800 sm:text-2xl">{subject.name} ✨</h1>
            </div>

            {!guest && (
              <div className="flex items-center gap-3">
                <span className="flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-rose-100 px-4 py-2 text-sm font-bold text-rose-700">
                  <Star className="size-4 fill-rose-500 text-rose-500" aria-hidden="true" />
                  {t("pointsLabel", { count: points })}
                </span>
                {/* Just before the ⚙️ in the corner. */}
                <FavoriteSubjectButton subjectId={subjectId} />
                <PreschoolLessonsFilterButton onChange={() => setVisibleCount(PAGE_SIZE)} />
              </div>
            )}
          </div>

          {!guest && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="w-full sm:max-w-xs">
                <ProgressBar percent={percent} compact colorful />
              </div>
              <span className="text-xs font-medium text-gray-500">
                {t("courseProgressLabel", {
                  percent,
                  completed: progress?.completed_count ?? 0,
                  total: progress?.total_count ?? 0,
                })}
              </span>
            </div>
          )}
        </div>

        {activeTab ? (
          <>
            {topicTabs.length > 1 && (
              <PreschoolTopicTabs tabs={topicTabs} activeId={activeTab.topic.id} onSelect={selectTopic} />
            )}
            <div role="tabpanel" className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {shownLessons.map((lesson, index) => (
                <PreschoolLessonCard
                  key={lesson.id}
                  lesson={lesson}
                  index={index}
                  subjectId={subjectId}
                  subjectIcon={subject.icon}
                  guest={guest}
                />
              ))}
            </div>
            {hasMore && <div ref={setSentinel} aria-hidden="true" className="h-px" />}
          </>
        ) : (
          <p className="text-center text-sm font-medium text-gray-500">
            {!guest && lessonsFilter === "favorites" ? t("noFavorites") : t("noLessons")}
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

// A signed-in student's own subject — see SubjectDetailPage.
export function PreschoolSubjectDetailPage({ subjectId }: { subjectId: number }) {
  const subjectQuery = useGetSubject(subjectId);
  const progressQuery = useGetSubjectProgress(subjectId);
  const topicsQuery = useListSubjectTopics(subjectId);
  const lessonsQuery = useListStudentSubjectLessons(subjectId);

  return (
    <PreschoolSubjectScreen
      subjectId={subjectId}
      subject={subjectQuery.data}
      topics={topicsQuery.data}
      lessons={lessonsQuery.data}
      progress={progressQuery.data}
      isLoading={subjectQuery.isLoading || topicsQuery.isLoading || lessonsQuery.isLoading}
      isError={subjectQuery.isError || topicsQuery.isError || lessonsQuery.isError}
      guest={false}
    />
  );
}

// The same screen for a visitor who isn't signed in — only reachable for a
// subject whose class is public (Class.is_public); anything else 404s and
// shows the error line.
export function PreschoolPublicSubjectDetailPage({ subjectId }: { subjectId: number }) {
  const subjectQuery = useGetPublicSubject(subjectId);
  const topicsQuery = useListPublicSubjectTopics(subjectId);
  const lessonsQuery = useListPublicSubjectLessons(subjectId);

  return (
    <PreschoolSubjectScreen
      subjectId={subjectId}
      subject={subjectQuery.data}
      topics={topicsQuery.data}
      lessons={lessonsQuery.data}
      progress={undefined}
      isLoading={subjectQuery.isLoading || topicsQuery.isLoading || lessonsQuery.isLoading}
      isError={subjectQuery.isError || topicsQuery.isError || lessonsQuery.isError}
      guest
    />
  );
}
