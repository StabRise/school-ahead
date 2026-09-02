"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AddMaterialDialog } from "@/components/add-material-dialog";
import { PageContainer } from "@/components/page-container";
import { ReadAlongContent } from "@/components/read-along-content";
import { LANGUAGE_OPTIONS, ReadAlongControlPanel } from "@/components/read-along-control-panel";
import type { SpeechLanguage } from "@/lib/piper-tts";
import { splitIntoSentenceParagraphs, splitIntoSentences } from "@/lib/sentence-split";
import { flatSentencesOf, type ReadingBlock } from "@/lib/reading-blocks";
import { useReadAlongPlayer } from "@/lib/use-read-along-player";
import type { ReadAlongExtractErrorCode, ReadAlongExtractResult } from "@/lib/read-along-types";
import { useAuthStore } from "@/stores/auth-store";

type InputMode = "text" | "link";

const EXTRACT_ERROR_MESSAGE_KEY: Record<ReadAlongExtractErrorCode, string> = {
  invalid_url: "errorInvalidUrl",
  blocked_host: "errorInvalidUrl",
  fetch_failed: "errorFetchFailed",
  not_html: "errorFetchFailed",
  container_not_found: "errorContainerNotFound",
};

// Paste-a-text-or-a-link-and-listen tool: a student either pastes text
// directly (a memo, a homework excerpt, ...) or pastes a link to an article
// (e.g. a zpe.gov.pl lesson page), picks which of the three piper-tts
// languages it's in (lib/piper-tts.ts's SpeechLanguage), and submits. The
// content is then read aloud sentence by sentence via the reusable
// ReadAlongPlayer (lib/use-read-along-player.ts), whose progress drives
// which sentence ReadAlongContent highlights as it's spoken — the same
// mechanism the lesson wizard's "Матеріали" tab
// (components/lesson-wizard/materials-step.tsx) reuses for a saved
// material's playback.
export function ReadAlongPage() {
  const t = useTranslations("ReadAlong");
  const [phase, setPhase] = useState<"input" | "reading">("input");
  const [mode, setMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [language, setLanguage] = useState<SpeechLanguage>("pl");
  const [validationError, setValidationError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchErrorKey, setFetchErrorKey] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const player = useReadAlongPlayer(phase === "reading");
  const translationScope = useAuthStore((state) => state.user?.translationScope ?? "word");
  const translateOnSelect = useAuthStore((state) => state.user?.translateOnSelect ?? false);

  const handleTextSubmit = () => {
    const paragraphs = splitIntoSentenceParagraphs(text);
    if (paragraphs.length === 0) {
      setValidationError(true);
      return;
    }
    setValidationError(false);
    const blocks: ReadingBlock[] = paragraphs.map((paragraph) => ({ kind: "paragraph", sentences: paragraph.sentences }));
    player.load(blocks, language);
    setPhase("reading");
  };

  const handleLinkSubmit = async () => {
    if (!link.trim()) {
      setValidationError(true);
      return;
    }
    setValidationError(false);
    setFetchErrorKey(null);
    setLoading(true);
    try {
      const response = await fetch("/api/read-along/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: ReadAlongExtractErrorCode } | null;
        setFetchErrorKey(EXTRACT_ERROR_MESSAGE_KEY[body?.error ?? "fetch_failed"]);
        return;
      }
      const result = (await response.json()) as ReadAlongExtractResult;
      const blocks: ReadingBlock[] = result.blocks.map((block) =>
        block.type === "image"
          ? { kind: "image", src: block.src, alt: block.alt }
          : { kind: block.type, sentences: splitIntoSentences(block.text) },
      );
      if (flatSentencesOf(blocks).length === 0) {
        setFetchErrorKey(EXTRACT_ERROR_MESSAGE_KEY.container_not_found);
        return;
      }
      player.load(blocks, language, result.title);
      setPhase("reading");
    } catch {
      setFetchErrorKey(EXTRACT_ERROR_MESSAGE_KEY.fetch_failed);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "text") handleTextSubmit();
    else void handleLinkSubmit();
  };

  const handleEdit = () => {
    player.stop();
    setPhase("input");
  };

  if (phase === "reading") {
    return (
      <PageContainer title={t("pageTitle")} maxWidthClassName="xl:max-w-4xl">
        {player.readingTitle && <p className="mb-2 truncate text-sm text-gray-500">{player.readingTitle}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleEdit}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t("editButton")}
          </button>
        </div>

        <div className="mt-6">
          <ReadAlongContent
            blocks={player.readingBlocks}
            speakingIndex={player.speakingIndex}
            sentenceRefs={player.sentenceRefs}
            selectionTarget={player.selectionTarget}
            sourceLanguage={player.language}
            translationScope={translationScope}
            translateOnSelect={translateOnSelect}
          />
        </div>

        {/* Reserves clearance below the last paragraph so the fixed bottom
            control panel never sits on top of it once fully scrolled down. */}
        <div className="h-24" aria-hidden="true" />

        <ReadAlongControlPanel
          speakingIndex={player.speakingIndex}
          currentParagraphIndex={player.currentParagraphIndex}
          paragraphCount={player.paragraphCount}
          language={player.language}
          onFromStart={player.playFromStart}
          onPrevious={player.playPreviousParagraph}
          onPlayPause={player.playPause}
          onNext={player.playNextParagraph}
          onLanguageChange={player.changeLanguage}
          onAddToLesson={() => setAddDialogOpen(true)}
        />

        <AddMaterialDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          blocks={player.readingBlocks}
          title={player.readingTitle}
          sourceUrl={mode === "link" ? link.trim() : ""}
          language={player.language}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer title={t("pageTitle")} maxWidthClassName="xl:max-w-4xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="inline-flex w-fit rounded-md border border-gray-300 p-0.5 text-sm">
          {(["text", "link"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setMode(option);
                setValidationError(false);
                setFetchErrorKey(null);
              }}
              className={`rounded px-3 py-1 font-medium ${
                mode === option ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {t(option === "text" ? "modeTextTab" : "modeLinkTab")}
            </button>
          ))}
        </div>

        {mode === "text" ? (
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
                if (validationError) setValidationError(false);
              }}
              placeholder={t("textareaPlaceholder")}
              className="rounded-md border border-gray-300 p-3 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
            {validationError && <p className="text-sm text-red-600">{t("emptyTextError")}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor="read-along-link" className="text-sm font-medium text-gray-700">
              {t("linkLabel")}
            </label>
            <input
              id="read-along-link"
              type="url"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                if (validationError) setValidationError(false);
                if (fetchErrorKey) setFetchErrorKey(null);
              }}
              placeholder={t("linkPlaceholder")}
              className="rounded-md border border-gray-300 p-3 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
            {validationError && <p className="text-sm text-red-600">{t("emptyLinkError")}</p>}
            {fetchErrorKey && <p className="text-sm text-red-600">{t(fetchErrorKey)}</p>}
          </div>
        )}

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
          disabled={loading}
          className="w-fit rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? t("loadingLink") : t("submitButton")}
        </button>
      </form>
    </PageContainer>
  );
}
