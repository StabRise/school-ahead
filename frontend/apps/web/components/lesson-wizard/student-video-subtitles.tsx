"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getGetStudentLessonVideoSubtitlesQueryKey,
  getStudentLessonVideoSubtitlesInLanguage,
  useGetStudentLessonVideoSubtitles,
} from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import type { VideoSubtitlesOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { VideoSubtitlesPanel } from "./video-subtitles-panel";

// The student's subtitles panel (lesson-wizard.tsx) — each video starts in
// the language the tutor picked for it (else its original one). Picking
// another language only swaps that video's entry in this page's cache: it
// isn't saved, so it never changes what the tutor or other students see.
export function StudentVideoSubtitles({ studentLessonId }: { studentLessonId: number }) {
  const queryClient = useQueryClient();
  const subtitlesQuery = useGetStudentLessonVideoSubtitles(studentLessonId, { query: { staleTime: Infinity } });
  const selectLanguage = useMutation({
    mutationFn: ({ videoId, language }: { videoId: string; language: string }) =>
      getStudentLessonVideoSubtitlesInLanguage(studentLessonId, videoId, { language }),
    onSuccess: (updated) =>
      queryClient.setQueryData<VideoSubtitlesOut[]>(
        getGetStudentLessonVideoSubtitlesQueryKey(studentLessonId),
        (videos) => videos?.map((video) => (video.video_id === updated.video_id ? updated : video)),
      ),
  });

  return (
    <VideoSubtitlesPanel
      videos={subtitlesQuery.data}
      isLoading={subtitlesQuery.isLoading}
      isError={subtitlesQuery.isError}
      onSelectLanguage={(videoId, language) => selectLanguage.mutate({ videoId, language })}
      isSelecting={selectLanguage.isPending}
      studentLessonId={studentLessonId}
    />
  );
}
