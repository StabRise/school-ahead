"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import {
  getListPublicSubjectLessonsPageQueryKey,
  listPublicSubjectLessonsPage,
  useListPublicSubjectLessonTopics,
  useListPublicSubjectPlaylist,
} from "@school-ahead/api-client/browser/public/public";
import {
  getListStudentSubjectLessonsPageQueryKey,
  listStudentSubjectLessonsPage,
  useListStudentSubjectLessonTopics,
  useListStudentSubjectPlaylist,
} from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import type { SubjectLessonOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import type { PreschoolLessonsFilter } from "@/lib/preschool-lessons-filter";

// How many lessons the preschool subject page fetches — and shows — at a time:
// the first ten, then ten more each time the child scrolls near the bottom. A
// subject can have hundreds (a YouTube playlist imported as lessons), and each
// card loads its own picture, so the page asks the server for a page at a time
// (lessons.api.list_student_subject_lessons_page) instead of the whole subject.
export const LESSONS_PAGE_SIZE = 10;

// The tabs: the topics that have lessons to show — for a student, under their
// lessons filter (chosen with the ⚙️); a visitor who isn't signed in sees every
// lesson. Both come with how many lessons each has, so no lesson is needed to
// draw them. Both hooks are always called (hooks can't be conditional); only
// the one for this kind of visitor is enabled.
export function useSubjectLessonTabs(subjectId: number, guest: boolean, filter: PreschoolLessonsFilter) {
  const student = useListStudentSubjectLessonTopics(subjectId, { filter }, { query: { enabled: !guest } });
  const visitor = useListPublicSubjectLessonTopics(subjectId, { query: { enabled: guest } });
  return guest ? visitor : student;
}

// One topic's lessons, a page at a time: `fetchNextPage` loads the next ten. The
// query key starts with the generated page-query key for the subject (topic and
// filter after it), so invalidating that key prefix — as the screens that
// change a lesson do — refreshes every topic's pages.
export function useSubjectLessonPages(
  subjectId: number,
  topicId: number | undefined,
  guest: boolean,
  filter: PreschoolLessonsFilter,
) {
  return useInfiniteQuery({
    queryKey: guest
      ? getListPublicSubjectLessonsPageQueryKey(subjectId, { topic_id: topicId ?? 0 })
      : getListStudentSubjectLessonsPageQueryKey(subjectId, { topic_id: topicId ?? 0, filter }),
    queryFn: ({ pageParam, signal }) => {
      const params = { topic_id: topicId ?? 0, limit: LESSONS_PAGE_SIZE, offset: pageParam };
      return guest
        ? listPublicSubjectLessonsPage(subjectId, params, undefined, signal)
        : listStudentSubjectLessonsPage(subjectId, { ...params, filter }, undefined, signal);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((total, page) => total + page.items.length, 0);
      return loaded < lastPage.count ? loaded : undefined;
    },
    // No topic until the tabs have arrived.
    enabled: topicId !== undefined,
    select: (data) => ({ lessons: data.pages.flatMap((page) => page.items) as SubjectLessonOut[] }),
  });
}

// The songs of the open topic for the ▶ player: every lesson of it with a
// YouTube link, in order, whatever the lessons filter (the ⚙️) says. A small list
// (an id, a title and a video id each). Songs rarely change, so it is kept for a
// few minutes instead of being fetched again on every visit or tab switch.
const PLAYLIST_STALE_MS = 5 * 60 * 1000;

export function useSubjectPlaylist(subjectId: number, topicId: number | undefined, guest: boolean) {
  const params = { topic_id: topicId ?? 0 };
  const student = useListStudentSubjectPlaylist(subjectId, params, {
    query: { enabled: !guest && topicId !== undefined, staleTime: PLAYLIST_STALE_MS },
  });
  const visitor = useListPublicSubjectPlaylist(subjectId, params, {
    query: { enabled: guest && topicId !== undefined, staleTime: PLAYLIST_STALE_MS },
  });
  return guest ? visitor : student;
}

