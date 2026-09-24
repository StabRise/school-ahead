"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  getGetTutorLessonVideoSubtitlesQueryKey,
  useGetTutorLessonVideoSubtitles,
  useSelectTutorLessonVideoSubtitlesLanguage,
} from "@school-ahead/api-client/browser/tutor/tutor";
import type { VideoSubtitlesOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { VideoSubtitlesPanel } from "@/components/lesson-wizard/video-subtitles-panel";

// The tutor's subtitles panel (tutor-lesson-detail-page.tsx). Picking a
// language is saved on the video — it's also what students see first.
export function LessonVideoSubtitles({ lessonId }: { lessonId: number }) {
  const queryClient = useQueryClient();
  const subtitlesQuery = useGetTutorLessonVideoSubtitles(lessonId, { query: { staleTime: Infinity } });
  const selectLanguage = useSelectTutorLessonVideoSubtitlesLanguage();

  const handleSelectLanguage = (videoId: string, languageCode: string) => {
    const video = subtitlesQuery.data?.find((item) => item.video_id === videoId);
    selectLanguage.mutate(
      // '' = back to the default (first) language, so the saved pick
      // follows the video's original language rather than pinning it.
      { lessonId, videoId, data: { language_code: languageCode === video?.languages[0] ? "" : languageCode } },
      {
        onSuccess: (updated) =>
          queryClient.setQueryData<VideoSubtitlesOut[]>(getGetTutorLessonVideoSubtitlesQueryKey(lessonId), (videos) =>
            videos?.map((item) => (item.video_id === updated.video_id ? updated : item)),
          ),
      },
    );
  };

  return (
    <VideoSubtitlesPanel
      videos={subtitlesQuery.data}
      isLoading={subtitlesQuery.isLoading}
      isError={subtitlesQuery.isError}
      onSelectLanguage={handleSelectLanguage}
      isSelecting={selectLanguage.isPending}
    />
  );
}
