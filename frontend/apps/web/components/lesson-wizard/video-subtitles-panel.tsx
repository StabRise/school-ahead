"use client";

import { useLocale, useTranslations } from "next-intl";
import type { SpeechLanguage } from "@school-ahead/api-client";
import type { VideoSubtitlesOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { TranslatableContent } from "@/components/translatable-content";
import { useSynopsisLanguageStore } from "@/stores/synopsis-language-store";

// The languages translate-on-select and the dictionary support
// (SpeechLanguage / backend MaterialLanguage).
const TRANSLATABLE_LANGUAGES: readonly string[] = ["en", "uk", "pl", "es"];

// The subtitles side panel — the left column of LessonPanels on the
// student wizard's "Теорія" tab (student-video-subtitles.tsx) and the
// tutor's Lesson detail page (tutor/lesson-video-subtitles.tsx). Lists
// every YouTube video the lesson links to, under its title, with a
// language dropdown (the original language first — see backend
// lessons/video_subtitles.py). Each caller owns the data and what picking a
// language does (the tutor's pick is saved for everyone, a student's only
// changes their own view). The text is wrapped in TranslatableContent like
// the конспект: translate-on-select everywhere, plus "add to dictionary" /
// "add to cards" only when `studentLessonId` is given (tutors have no
// dictionary or cards of their own).
export function VideoSubtitlesPanel({
  videos,
  isLoading,
  isError,
  onSelectLanguage,
  isSelecting,
  studentLessonId,
}: {
  videos: VideoSubtitlesOut[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onSelectLanguage: (videoId: string, languageCode: string) => void;
  isSelecting: boolean;
  studentLessonId?: number;
}) {
  const t = useTranslations("VideoSubtitles");

  let body: React.ReactNode;
  if (isLoading) {
    body = <p className="text-sm text-gray-500">{t("loading")}</p>;
  } else if (isError || !videos) {
    body = <p className="text-sm text-red-600">{t("error")}</p>;
  } else if (videos.length === 0) {
    body = <p className="text-sm text-gray-500">{t("noVideos")}</p>;
  } else {
    body = (
      <div className="flex flex-col gap-6">
        {videos.map((video, index) => (
          <VideoSubtitles
            key={video.video_id}
            video={video}
            index={index}
            onSelectLanguage={(languageCode) => onSelectLanguage(video.video_id, languageCode)}
            isSelecting={isSelecting}
            studentLessonId={studentLessonId}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-gray-700">{t("panelLabel")}</span>
      {body}
    </div>
  );
}

function VideoSubtitles({
  video,
  index,
  onSelectLanguage,
  isSelecting,
  studentLessonId,
}: {
  video: VideoSubtitlesOut;
  index: number;
  onSelectLanguage: (languageCode: string) => void;
  isSelecting: boolean;
  studentLessonId?: number;
}) {
  const t = useTranslations("VideoSubtitles");
  const locale = useLocale();
  // Subtitles outside the translatable languages fall back to the same
  // persisted source-language preference the конспект's picker controls.
  const storedLanguage = useSynopsisLanguageStore((state) => state.synopsisLanguage);
  const baseLanguage = video.language_code.split("-")[0].toLowerCase();
  const sourceLanguage = (
    TRANSLATABLE_LANGUAGES.includes(baseLanguage) ? baseLanguage : storedLanguage
  ) as SpeechLanguage;

  const languageName = (code: string) => {
    try {
      return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
    } catch {
      return code;
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-gray-900">
        {video.title || t("untitledVideo", { index: index + 1 })}
      </h2>

      {video.languages.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <select
            value={video.language_code}
            onChange={(e) => onSelectLanguage(e.target.value)}
            disabled={isSelecting}
            aria-label={t("languageLabel")}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 disabled:opacity-50"
          >
            {video.languages.map((code) => (
              <option key={code} value={code}>
                {code === video.original_language
                  ? t("originalLanguage", { language: languageName(code) })
                  : languageName(code)}
              </option>
            ))}
          </select>
          {video.status === "ok" && video.source === "youtube_auto" && <span>{t("sourceYoutubeAuto")}</span>}
        </div>
      )}

      {video.status === "ok" ? (
        <TranslatableContent
          sourceLanguage={sourceLanguage}
          enableDictionary={studentLessonId !== undefined}
          studentLessonId={studentLessonId}
        >
          <div lang={video.language_code || undefined} className="flex flex-col gap-3 text-sm text-gray-700">
            {video.text.split("\n\n").map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex}>{paragraph}</p>
            ))}
          </div>
        </TranslatableContent>
      ) : (
        <p className="text-sm text-gray-500">{t(video.status === "unavailable" ? "unavailable" : "fetchError")}</p>
      )}
    </section>
  );
}
