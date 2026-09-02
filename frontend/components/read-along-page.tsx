"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/page-container";
import { prefetchVoice, speakSequence, type SpeechLanguage } from "@/lib/piper-tts";
import { splitIntoSentenceParagraphs } from "@/lib/sentence-split";

const LANGUAGE_OPTIONS: { value: SpeechLanguage; labelKey: string }[] = [
  { value: "en", labelKey: "languageEnglish" },
  { value: "uk", labelKey: "languageUkrainian" },
  { value: "pl", labelKey: "languagePolish" },
];

// Paste-a-text-and-listen tool: a student pastes any text (a memo, a
// homework excerpt, ...), picks which of the three piper-tts languages it's
// in (lib/piper-tts.ts's SpeechLanguage), and submits. The text is then
// read aloud sentence by sentence via speakSequence(), whose onProgress
// callback drives which sentence is highlighted as it's spoken — the same
// mechanism components/preschool/quiz-game.tsx uses for its read-aloud
// button, just applied to a whole pasted text instead of one quiz question.
export function ReadAlongPage() {
  const t = useTranslations("ReadAlong");
  const [phase, setPhase] = useState<"input" | "reading">("input");
  const [text, setText] = useState("");
  const [language, setLanguage] = useState<SpeechLanguage>("uk");
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const readingLanguageRef = useRef<SpeechLanguage>("uk");

  const paragraphs = useMemo(() => splitIntoSentenceParagraphs(text), [text]);
  const sentences = useMemo(() => paragraphs.flatMap((paragraph) => paragraph.sentences), [paragraphs]);

  const startReading = (fromSentences: string[], fromLanguage: SpeechLanguage) => {
    void prefetchVoice(fromLanguage).then(() => {
      void speakSequence(fromSentences, fromLanguage, setSpeakingIndex);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sentences.length === 0) {
      setError(true);
      return;
    }
    setError(false);
    readingLanguageRef.current = language;
    setPhase("reading");
    startReading(sentences, language);
  };

  const handleStop = () => {
    void speakSequence([], readingLanguageRef.current);
    setSpeakingIndex(null);
  };

  const handleReplay = () => {
    handleStop();
    startReading(sentences, readingLanguageRef.current);
  };

  const handleEdit = () => {
    handleStop();
    setPhase("input");
  };

  if (phase === "reading") {
    let runningIndex = 0;
    return (
      <PageContainer title={t("pageTitle")} maxWidthClassName="xl:max-w-4xl">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleEdit}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t("editButton")}
          </button>
          <button
            type="button"
            onClick={handleReplay}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            {t("replayButton")}
          </button>
          <button
            type="button"
            onClick={handleStop}
            disabled={speakingIndex === null}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("stopButton")}
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-4 rounded-md border border-gray-200 p-6 text-lg leading-relaxed">
          {paragraphs.map((paragraph, paragraphIndex) => (
            <p key={paragraphIndex}>
              {paragraph.sentences.map((sentence) => {
                const index = runningIndex++;
                return (
                  <span
                    key={index}
                    className={
                      index === speakingIndex
                        ? "rounded bg-yellow-200 transition-colors"
                        : "rounded transition-colors"
                    }
                  >
                    {sentence}{" "}
                  </span>
                );
              })}
            </p>
          ))}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title={t("pageTitle")} maxWidthClassName="xl:max-w-4xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="read-along-text" className="text-sm font-medium text-gray-700">
            {t("textareaLabel")}
          </label>
          <textarea
            id="read-along-text"
            rows={10}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(false);
            }}
            placeholder={t("textareaPlaceholder")}
            className="rounded-md border border-gray-300 p-3 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
          {error && <p className="text-sm text-red-600">{t("emptyTextError")}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="read-along-language" className="text-sm font-medium text-gray-700">
            {t("languageLabel")}
          </label>
          <select
            id="read-along-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as SpeechLanguage)}
            className="w-fit rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="w-fit rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          {t("submitButton")}
        </button>
      </form>
    </PageContainer>
  );
}
