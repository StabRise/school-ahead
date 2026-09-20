"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { Cloud, PreschoolButton, Raccoon, Sun, useLessonOpenMode } from "@school-ahead/preschool-ui";
import { AvatarBadge, useEquippedAvatarLayers } from "@school-ahead/avatar";
import { useGetSubject } from "@school-ahead/api-client/browser/academics/academics";
import { useGetPublicSubject } from "@school-ahead/api-client/browser/public/public";
import {
  getGetNextLessonQueryKey,
  getGetSubjectProgressQueryKey,
  getListFavoriteSubjectIdsQueryKey,
  getListStudentSubjectLessonsPageQueryKey,
  getListStudentSubjectLessonsQueryKey,
  getListStudentSubjectLessonTopicsQueryKey,
  useGetSubjectProgress,
  useListFavoriteSubjectIds,
  useSetSubjectFavorite,
  useStartLessonToday,
} from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import { getGetTodayQueryKey } from "@school-ahead/api-client/browser/schedule/schedule";
import type {
  LessonTopicOut,
  PlaylistTrackOut,
  SubjectLessonOut,
  SubjectProgressOut,
} from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { useTabQueryParam } from "@/lib/use-tab-query-param";
import { usePreschoolLessonsFilterStore } from "@/stores/preschool-lessons-filter-store";
import { useRouter } from "@/i18n/navigation";
import { HeartIcon } from "@/components/preschool/heart-icon";
import { PreschoolLessonTile } from "@/components/subjects/preschool-lesson-tile";
import { PreschoolLessonsFilterButton } from "@/components/subjects/preschool-lessons-filter-button";
import { ProgressBar } from "@/components/progress-bar";
import { useDialogs } from "@/components/dialogs/app-dialogs";
import { SubjectPlayer } from "@/components/subjects/subject-player";
import { PlayerTrackActions } from "@/components/subjects/subject-player-actions";
import {
  useSubjectLessonPages,
  useSubjectLessonTabs,
  useSubjectPlaylist,
} from "@/components/subjects/use-subject-lessons";
import { loadYouTubeIframeApi } from "@/lib/youtube-iframe-api";

// The student's dressed companion — same CompanionAvatar idiom as
// game-map.tsx/calendar-view.tsx (preschool-ui), just kept local here since
// this is the only app-side preschool screen that needs it.
function CompanionAvatar({ className }: { className: string }) {
  const layers = useEquippedAvatarLayers();
  return <AvatarBadge layers={layers} className={className} fallback={<Raccoon mood="happy" className={className} />} />;
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
          // The page's own tabs and pages (a lesson just became assigned).
          queryClient.invalidateQueries({ queryKey: getListStudentSubjectLessonsPageQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getListStudentSubjectLessonTopicsQueryKey(subjectId) });
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
  onPlay,
}: {
  lesson: SubjectLessonOut;
  index: number;
  subjectId: number;
  subjectIcon: string | null;
  guest: boolean;
  // Set when the bookshelf's ⚙️ says lessons play fullscreen and this one has a
  // video: the card plays it in the player instead of opening the lesson (and
  // starts nothing — a lesson a student has no StudentLesson for yet gets one
  // only if they tap the player's ✅ or ❤️).
  onPlay: (() => void) | undefined;
}) {
  if (onPlay) {
    return (
      <PreschoolLessonTile
        onClick={onPlay}
        icon={lesson.icon}
        subjectIcon={subjectIcon}
        lessonType={lesson.lesson_type}
        title={lesson.title}
        index={index}
      />
    );
  }

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

// The ▶ in the header — plays every song of the open topic (tab), one after
// another, in an overlay player (SubjectPlayer, rendered by the screen). Only shown
// when the topic has songs (lessons with a YouTube link); for a visitor who isn't
// signed in too. The songs are fetched once the page has loaded (and again for each
// tab opened), and YouTube's player script is fetched with them (by the screen), so a
// tap can start playing right away, inside the tap — the sound is allowed because
// the child asked for it.
function PlayAllButton({ tracks, onPlay }: { tracks: PlaylistTrackOut[] | undefined; onPlay: () => void }) {
  const t = useTranslations("PreschoolSubjectDetail.player");
  if (!tracks || tracks.length === 0) return null;
  return (
    <PreschoolButton
      icon="▶️"
      label={t("playAll")}
      onClick={onPlay}
      ringColorClassName="ring-emerald-400"
      position="static"
      className="shrink-0"
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
  tabs: LessonTopicOut[];
  activeId: number;
  onSelect: (topicId: number) => void;
}) {
  return (
    <div role="tablist" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
      {tabs.map((topic) => {
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
// The screen draws the subject and asks for its lessons a page at a time — the
// tabs first (a small list), then ten cards of the open topic, ten more as the
// child scrolls (see use-subject-lessons.ts). The two exports below only fetch
// the subject itself: a signed-in student's own, or, for a visitor who isn't
// signed in, the public read-only copy (see docs/core/public_access.md).
function PreschoolSubjectScreen({
  subjectId,
  subject,
  progress,
  isLoading: subjectLoading,
  isError: subjectError,
  guest,
}: {
  subjectId: number;
  subject: { name: string; icon: string | null } | undefined;
  progress: SubjectProgressOut | undefined;
  isLoading: boolean;
  isError: boolean;
  // A visitor who isn't signed in: no progress, points or lesson filter (there
  // is nothing of theirs to filter by), and a card just opens the lesson.
  guest: boolean;
}) {
  const t = useTranslations("PreschoolSubjectDetail");
  const locale = useLocale();
  // Which lessons make the cut is the child's own choice (the gear in the
  // header, remembered for every subject) — see lib/preschool-lessons-filter.ts;
  // the server applies it. A visitor who isn't signed in sees every lesson.
  const lessonsFilter = usePreschoolLessonsFilterStore((state) => state.filter);

  // A topic with nothing left to show gets no tab, rather than an empty one.
  const tabsQuery = useSubjectLessonTabs(subjectId, guest, lessonsFilter);
  const tabs = tabsQuery.data ?? [];

  // The open topic lives in `?topic=<id>`, so coming back from a lesson (or a
  // reload) lands on the same tab. An id that has no tab (a stale link, or a
  // topic the filter just emptied) falls back to the first one.
  const [activeTopicParam, setActiveTopicParam] = useTabQueryParam(String(tabs[0]?.id ?? ""), "topic");
  const activeTab = tabs.find((tab) => String(tab.id) === activeTopicParam) ?? tabs[0];

  const pagesQuery = useSubjectLessonPages(subjectId, activeTab?.id, guest, lessonsFilter);
  const shownLessons = pagesQuery.data?.lessons ?? [];
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pagesQuery;

  // Infinite scroll: whenever the sentinel below the grid comes within ~a
  // screen of the viewport, fetch the next ten. The observer is recreated after
  // every page (`shownLessons.length` in the deps) — a fresh observer reports the
  // sentinel's current state right away, so if a page didn't push it out of
  // range (tall screen), the next one loads without needing a scroll.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || !sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void fetchNextPage();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, sentinel, shownLessons.length, fetchNextPage]);

  // The open topic's songs: the ▶ in the header plays them all, and — when the
  // bookshelf's ⚙️ says lessons play fullscreen — tapping a lesson with a video plays
  // from that lesson on. One player, open or not (`player`), from the first song or
  // from the tapped one. It keeps the topic and the songs it was opened with: a ✅ in
  // it can empty the topic's tab (under the "available" filter) and the page behind
  // moves to another tab, which must not pull the player along.
  const tracks = useSubjectPlaylist(subjectId, activeTab?.id, guest).data;
  const hasSongs = (tracks?.length ?? 0) > 0;
  useEffect(() => {
    if (hasSongs) void loadYouTubeIframeApi().catch(() => {});
  }, [hasSongs]);
  const trackIndexByLesson = useMemo(
    () => new Map((tracks ?? []).map((track, position) => [track.lesson_id, position])),
    [tracks],
  );
  // This subject's own choice (its ⚙️), else the bookshelf's.
  const lessonOpenMode = useLessonOpenMode(subjectId);
  const [player, setPlayer] = useState<{
    topicId: number;
    tracks: PlaylistTrackOut[];
    startIndex: number;
    fullscreen: boolean;
  } | null>(null);
  const openPlayer = (startIndex: number, fullscreen: boolean) => {
    if (activeTab && tracks) setPlayer({ topicId: activeTab.id, tracks, startIndex, fullscreen });
  };
  const playFrom = (lessonId: number) => {
    const startIndex = trackIndexByLesson.get(lessonId);
    if (lessonOpenMode !== "fullscreen" || startIndex === undefined) return undefined;
    return () => openPlayer(startIndex, true);
  };

  const isLoading = subjectLoading || tabsQuery.isLoading;
  const isError = subjectError || tabsQuery.isError;

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
                  be, for a visitor who isn't signed in too (the shelf then has its
                  own 🏠 to the root). PreschoolButton links with next/link, which
                  knows nothing about the locale, so the href carries it explicitly. */}
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

            <div className="flex items-center gap-3">
              {!guest && (
                <span className="flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-rose-100 px-4 py-2 text-sm font-bold text-rose-700">
                  <Star className="size-4 fill-rose-500 text-rose-500" aria-hidden="true" />
                  {t("pointsLabel", { count: points })}
                </span>
              )}
              <PlayAllButton tracks={tracks} onPlay={() => openPlayer(0, false)} />
              {/* Just before the ⚙️ in the corner. */}
              {!guest && <FavoriteSubjectButton subjectId={subjectId} />}
              <PreschoolLessonsFilterButton subjectId={subjectId} guest={guest} />
            </div>
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
            {tabs.length > 1 && (
              <PreschoolTopicTabs tabs={tabs} activeId={activeTab.id} onSelect={(topicId) => setActiveTopicParam(String(topicId))} />
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
                  onPlay={playFrom(lesson.id)}
                />
              ))}
            </div>
            {pagesQuery.isError && <p className="text-center text-sm font-medium text-red-700">{t("error")}</p>}
            {(pagesQuery.isLoading || isFetchingNextPage) && (
              <p className="text-center text-sm font-medium text-emerald-800">{t("loading")}</p>
            )}
            {hasNextPage && <div ref={setSentinel} aria-hidden="true" className="h-px" />}
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
      {player && (
        <SubjectPlayer
          tracks={player.tracks}
          startIndex={player.startIndex}
          startFullscreen={player.fullscreen}
          onClose={() => setPlayer(null)}
          trackActions={
            guest
              ? undefined
              : (track, layout) => (
                  <PlayerTrackActions subjectId={subjectId} topicId={player.topicId} track={track} layout={layout} />
                )
          }
        />
      )}
    </div>
  );
}

// A signed-in student's own subject — see SubjectDetailPage.
export function PreschoolSubjectDetailPage({ subjectId }: { subjectId: number }) {
  const subjectQuery = useGetSubject(subjectId);
  const progressQuery = useGetSubjectProgress(subjectId);

  return (
    <PreschoolSubjectScreen
      subjectId={subjectId}
      subject={subjectQuery.data}
      progress={progressQuery.data}
      isLoading={subjectQuery.isLoading}
      isError={subjectQuery.isError}
      guest={false}
    />
  );
}

// The same screen for a visitor who isn't signed in — only reachable for a
// subject whose class is public (Class.is_public); anything else 404s and
// shows the error line.
export function PreschoolPublicSubjectDetailPage({ subjectId }: { subjectId: number }) {
  const subjectQuery = useGetPublicSubject(subjectId);

  return (
    <PreschoolSubjectScreen
      subjectId={subjectId}
      subject={subjectQuery.data}
      progress={undefined}
      isLoading={subjectQuery.isLoading}
      isError={subjectQuery.isError}
      guest
    />
  );
}
