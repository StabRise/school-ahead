"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import type { SpeechLanguage } from "@school-ahead/api-client";
import type { VideoSubtitlesOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { TranslatableContent } from "@/components/translatable-content";
import { isTranslatorSupported, translateText } from "@/lib/chrome-translator";
import { splitIntoSentences } from "@/lib/sentence-split";
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
// dictionary or cards of their own). The "Перекласти" button translates the
// whole text sentence by sentence (Chrome's on-device Translator, like
// translate-on-select) into the interface language, showing each
// translation in small grey type under its sentence.
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

  const canTranslate = video.status === "ok" && sourceLanguage !== locale && isTranslatorSupported();
  const paragraphs = video.text.split("\n\n").map(splitIntoSentences);
  // Keyed by the text it was made for, so switching the subtitles language
  // drops back to the untranslated view instead of showing stale lines.
  const [translation, setTranslation] = useState<{
    text: string;
    sentences: (string | null)[][];
    error: boolean;
  } | null>(null);
  const runId = useRef(0);
  const shownTranslation = translation?.text === video.text ? translation : null;

  const translate = async () => {
    const id = ++runId.current;
    const text = video.text;
    const sentences = paragraphs.map((paragraph) => paragraph.map((): string | null => null));
    setTranslation({ text, sentences, error: false });
    try {
      for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
        for (const [sentenceIndex, sentence] of paragraph.entries()) {
          const translated = await translateText(sentence, sourceLanguage, locale as SpeechLanguage);
          if (runId.current !== id) return;
          sentences[paragraphIndex][sentenceIndex] = translated;
          setTranslation({ text, sentences: sentences.map((row) => [...row]), error: false });
        }
      }
    } catch {
      if (runId.current === id) setTranslation({ text, sentences, error: true });
    }
  };

  const toggleTranslation = () => {
    if (shownTranslation) {
      runId.current++;
      setTranslation(null);
    } else {
      void translate();
    }
  };

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
          {canTranslate && (
            <button
              type="button"
              onClick={toggleTranslation}
              aria-pressed={shownTranslation !== null}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              <Languages className="size-3.5" aria-hidden />
              {shownTranslation ? t("hideTranslationButton") : t("translateButton")}
            </button>
          )}
        </div>
      )}

      {video.status === "ok" ? (
        <TranslatableContent
          sourceLanguage={sourceLanguage}
          enableDictionary={studentLessonId !== undefined}
          studentLessonId={studentLessonId}
        >
          {shownTranslation ? (
            <div className="flex flex-col gap-3 text-sm">
              {paragraphs.map((paragraph, paragraphIndex) => (
                <div key={paragraphIndex} className="flex flex-col gap-2">
                  {paragraph.map((sentence, sentenceIndex) => {
                    const translated = shownTranslation.sentences[paragraphIndex]?.[sentenceIndex];
                    return (
                      <p key={sentenceIndex} className="flex flex-col">
                        <span lang={video.language_code || undefined} className="text-gray-900">
                          {sentence}
                        </span>
                        {translated ? (
                          <span lang={locale} className="text-xs text-gray-500">
                            {translated}
                          </span>
                        ) : (
                          !shownTranslation.error && <span className="text-xs text-gray-400">…</span>
                        )}
                      </p>
                    );
                  })}
                </div>
              ))}
              {shownTranslation.error && <p className="text-xs text-red-600">{t("translateError")}</p>}
            </div>
          ) : (
            <div lang={video.language_code || undefined} className="flex flex-col gap-3 text-sm text-gray-700">
              {paragraphs.map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex}>{paragraph.join(" ")}</p>
              ))}
            </div>
          )}
        </TranslatableContent>
      ) : (
        <p className="text-sm text-gray-500">{t(video.status === "unavailable" ? "unavailable" : "fetchError")}</p>
      )}
    </section>
  );
}
