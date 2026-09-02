"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FastForward, Play, Rewind, SkipBack, Square } from "lucide-react";
import { PageContainer } from "@/components/page-container";
import { prefetchVoice, speakSequence, type SpeechLanguage } from "@/lib/piper-tts";
import { splitIntoSentenceParagraphs, splitIntoSentences } from "@/lib/sentence-split";
import type { ReadAlongExtractErrorCode, ReadAlongExtractResult } from "@/lib/read-along-types";

const LANGUAGE_OPTIONS: { value: SpeechLanguage; labelKey: string }[] = [
  { value: "pl", labelKey: "languagePolish" },
  { value: "en", labelKey: "languageEnglish" },
  { value: "uk", labelKey: "languageUkrainian" },
];

type InputMode = "text" | "link";

// What's actually rendered/read once the student has submitted, regardless
// of whether it came from pasted text (one block per paragraph) or a
// fetched link (one block per heading/paragraph/image the extract route
// found — see app/api/read-along/extract/route.ts).
type ReadingBlock =
  | { kind: "heading"; sentences: string[] }
  | { kind: "paragraph"; sentences: string[] }
  | { kind: "image"; src: string; alt: string };

const EXTRACT_ERROR_MESSAGE_KEY: Record<ReadAlongExtractErrorCode, string> = {
  invalid_url: "errorInvalidUrl",
  blocked_host: "errorInvalidUrl",
  fetch_failed: "errorFetchFailed",
  not_html: "errorFetchFailed",
  container_not_found: "errorContainerNotFound",
};

function flatSentencesOf(blocks: ReadingBlock[]): string[] {
  return blocks.flatMap((block) => (block.kind === "image" ? [] : block.sentences));
}

// One entry per non-image block (heading or paragraph), giving the [start,
// end) range it occupies in flatSentencesOf(blocks)'s global sentence
// indexing — what the bottom control panel's "previous/next paragraph" and
// "from start" buttons jump between.
function paragraphRangesOf(blocks: ReadingBlock[]): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let index = 0;
  for (const block of blocks) {
    if (block.kind === "image") continue;
    const start = index;
    index += block.sentences.length;
    ranges.push({ start, end: index });
  }
  return ranges;
}

// Where to float the "Прочитати" button once a selection covering at least
// one rendered sentence exists, and which of those sentences (by their
// global index into flatSentencesOf(readingBlocks) — the same indexing
// sentenceRefs and speakingIndex already use) it should read.
interface SelectionReadTarget {
  top: number;
  left: number;
  sentenceIndices: number[];
}

// Paste-a-text-or-a-link-and-listen tool: a student either pastes text
// directly (a memo, a homework excerpt, ...) or pastes a link to an article
// (e.g. a zpe.gov.pl lesson page), picks which of the three piper-tts
// languages it's in (lib/piper-tts.ts's SpeechLanguage), and submits. The
// content is then read aloud sentence by sentence via speakSequence(),
// whose onProgress callback drives which sentence is highlighted as it's
// spoken — the same mechanism components/preschool/quiz-game.tsx uses for
// its read-aloud button, just applied to a whole text/article instead of
// one quiz question.
export function ReadAlongPage() {
  const t = useTranslations("ReadAlong");
  const [phase, setPhase] = useState<"input" | "reading">("input");
  const [mode, setMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [language, setLanguage] = useState<SpeechLanguage>("pl");
  const [readingBlocks, setReadingBlocks] = useState<ReadingBlock[]>([]);
  const [readingTitle, setReadingTitle] = useState<string | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [validationError, setValidationError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchErrorKey, setFetchErrorKey] = useState<string | null>(null);
  const [selectionTarget, setSelectionTarget] = useState<SelectionReadTarget | null>(null);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
  const readingLanguageRef = useRef<SpeechLanguage>("pl");
  const sentenceRefs = useRef<Record<number, HTMLSpanElement | null>>({});

  const paragraphRanges = useMemo(() => paragraphRangesOf(readingBlocks), [readingBlocks]);

  // Keeps the currently-spoken sentence in view for a long, scrolled
  // article read in from a link.
  useEffect(() => {
    if (speakingIndex === null) return;
    sentenceRefs.current[speakingIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [speakingIndex]);

  // speakSequence()'s onProgress hands back a global sentence index (or null
  // once it's done) — this both drives the highlight (speakingIndex) and,
  // while playing, keeps currentParagraphIndex in sync with wherever
  // playback actually is, so the bottom panel's previous/next buttons stay
  // relative to real progress instead of where navigation last jumped to.
  const applyProgress = (globalIndex: number | null) => {
    setSpeakingIndex(globalIndex);
    if (globalIndex === null) return;
    const paragraphIndex = paragraphRanges.findIndex((range) => globalIndex >= range.start && globalIndex < range.end);
    if (paragraphIndex !== -1) setCurrentParagraphIndex(paragraphIndex);
  };

  // Selecting any part of the rendered text surfaces a floating "Прочитати"
  // button (see SelectionReadTarget) — clicking it reads back just the
  // sentences the selection touches. Scoped to the reading phase only: a
  // <textarea>'s own selection never reaches document.getSelection(), so
  // this naturally never fires for the input form.
  useEffect(() => {
    if (phase !== "reading") return;

    const handleSelectionChange = () => {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setSelectionTarget(null);
        return;
      }

      const indices: number[] = [];
      for (const [key, el] of Object.entries(sentenceRefs.current)) {
        if (el && selection.containsNode(el, true)) indices.push(Number(key));
      }
      if (indices.length === 0) {
        setSelectionTarget(null);
        return;
      }
      indices.sort((a, b) => a - b);

      const rect = selection.getRangeAt(0).getBoundingClientRect();
      setSelectionTarget({
        top: Math.max(8, rect.top - 10),
        left: Math.min(Math.max(8, rect.left + rect.width / 2), window.innerWidth - 8),
        sentenceIndices: indices,
      });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [phase]);

  // Shows the submitted content and warms the voice cache, but — per the
  // bottom control panel below — doesn't start speaking on its own; reading
  // only begins once the student presses the play button.
  const startReading = (blocks: ReadingBlock[], fromLanguage: SpeechLanguage, title: string | null = null) => {
    sentenceRefs.current = {};
    setSelectionTarget(null);
    setReadingBlocks(blocks);
    setReadingTitle(title);
    setCurrentParagraphIndex(0);
    setSpeakingIndex(null);
    readingLanguageRef.current = fromLanguage;
    setPhase("reading");
    void prefetchVoice(fromLanguage);
  };

  // Reads back only the sentences the current selection covers: clears the
  // selection, then speaks those sentences via the same speakSequence()
  // (which cuts off anything already playing) — its onProgress index is
  // local to this subset, so it's mapped back through sentenceIndices to the
  // global index speakingIndex/sentenceRefs already key their highlight off.
  const handleReadSelection = () => {
    if (!selectionTarget) return;
    const { sentenceIndices } = selectionTarget;
    window.getSelection()?.removeAllRanges();
    setSelectionTarget(null);
    const allSentences = flatSentencesOf(readingBlocks);
    const texts = sentenceIndices.map((index) => allSentences[index]);
    void speakSequence(texts, readingLanguageRef.current, (localIndex) => {
      applyProgress(localIndex === null ? null : sentenceIndices[localIndex]);
    });
  };

  const handleTextSubmit = () => {
    const paragraphs = splitIntoSentenceParagraphs(text);
    if (paragraphs.length === 0) {
      setValidationError(true);
      return;
    }
    setValidationError(false);
    startReading(
      paragraphs.map((paragraph) => ({ kind: "paragraph", sentences: paragraph.sentences })),
      language,
    );
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
      startReading(blocks, language, result.title);
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

  const handleStop = () => {
    void speakSequence([], readingLanguageRef.current);
    setSpeakingIndex(null);
  };

  // Starts speaking from the given paragraph's first sentence through to the
  // end of the content (not just that one paragraph) — the usual
  // previous/next-track behavior in a media player, just at paragraph
  // granularity. Used by all three bottom-panel navigation buttons.
  const playFromParagraph = (paragraphIndex: number) => {
    const range = paragraphRanges[paragraphIndex];
    if (!range) return;
    setCurrentParagraphIndex(paragraphIndex);
    const remainingSentences = flatSentencesOf(readingBlocks).slice(range.start);
    void speakSequence(remainingSentences, readingLanguageRef.current, (localIndex) => {
      applyProgress(localIndex === null ? null : range.start + localIndex);
    });
  };

  // The panel's play button reads back the current selection instead of
  // resuming from currentParagraphIndex when the student has one active —
  // same as tapping the floating "Прочитати" button next to the selection.
  const handlePlayStop = () => {
    if (speakingIndex !== null) handleStop();
    else if (selectionTarget) handleReadSelection();
    else playFromParagraph(currentParagraphIndex);
  };

  const handleFromStart = () => playFromParagraph(0);
  const handlePreviousParagraph = () => playFromParagraph(Math.max(0, currentParagraphIndex - 1));
  const handleNextParagraph = () => playFromParagraph(Math.min(paragraphRanges.length - 1, currentParagraphIndex + 1));

  // Switching language mid-reading stops playback rather than letting the
  // in-flight utterance finish in the old voice — voiceIdFor() (lib/piper-tts.ts)
  // is only consulted at the start of each speakSequence() call, so the
  // current sentence wouldn't switch voice anyway, and continuing to speak
  // in a since-changed language would be confusing.
  const handleLanguageChange = (newLanguage: SpeechLanguage) => {
    handleStop();
    setLanguage(newLanguage);
    readingLanguageRef.current = newLanguage;
    void prefetchVoice(newLanguage);
  };

  const handleEdit = () => {
    handleStop();
    setPhase("input");
  };

  if (phase === "reading") {
    let runningIndex = 0;
    return (
      <PageContainer title={t("pageTitle")} maxWidthClassName="xl:max-w-4xl">
        {selectionTarget && (
          <button
            type="button"
            // Keeps the browser from collapsing the selection on mousedown,
            // which would otherwise clear selectionTarget (via
            // selectionchange) before this button's click ever fires.
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleReadSelection}
            style={{
              position: "fixed",
              top: selectionTarget.top,
              left: selectionTarget.left,
              transform: "translate(-50%, -100%)",
            }}
            className="z-50 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-gray-800"
          >
            {t("readSelectionButton")}
          </button>
        )}

        {readingTitle && <p className="mb-2 truncate text-sm text-gray-500">{readingTitle}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleEdit}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t("editButton")}
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-4 rounded-md border border-gray-200 p-6 text-lg leading-relaxed">
          {readingBlocks.map((block, blockIndex) => {
            if (block.kind === "image") {
              return (
                // eslint-disable-next-line @next/next/no-img-element -- external, build-time-unknown domain
                <img
                  key={blockIndex}
                  src={block.src}
                  alt={block.alt}
                  className="max-w-full self-center rounded-md object-contain"
                />
              );
            }
            const Tag = block.kind === "heading" ? "h2" : "p";
            return (
              <Tag key={blockIndex} className={block.kind === "heading" ? "text-xl font-bold" : undefined}>
                {block.sentences.map((sentence) => {
                  const index = runningIndex++;
                  return (
                    <span
                      key={index}
                      ref={(el) => {
                        sentenceRefs.current[index] = el;
                      }}
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
              </Tag>
            );
          })}
        </div>

        {/* Reserves clearance below the last paragraph so the fixed bottom
            control panel never sits on top of it once fully scrolled down. */}
        <div className="h-24" aria-hidden="true" />

        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2.5 text-white shadow-xl sm:gap-4 sm:px-5 sm:py-3">
            <button
              type="button"
              aria-label={t("fromStartButton")}
              onClick={handleFromStart}
              className="rounded-full p-2 hover:bg-white/10"
            >
              <SkipBack className="h-5 w-5" fill="currentColor" />
            </button>
            <button
              type="button"
              aria-label={t("previousParagraphButton")}
              onClick={handlePreviousParagraph}
              disabled={currentParagraphIndex === 0}
              className="rounded-full p-2 hover:bg-white/10 disabled:opacity-40"
            >
              <Rewind className="h-5 w-5" fill="currentColor" />
            </button>
            <button
              type="button"
              aria-label={speakingIndex !== null ? t("stopButton") : t("playButton")}
              onClick={handlePlayStop}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-900 hover:bg-gray-100"
            >
              {speakingIndex !== null ? (
                <Square className="h-5 w-5" fill="currentColor" />
              ) : (
                <Play className="h-5 w-5 translate-x-0.5" fill="currentColor" />
              )}
            </button>
            <button
              type="button"
              aria-label={t("nextParagraphButton")}
              onClick={handleNextParagraph}
              disabled={currentParagraphIndex >= paragraphRanges.length - 1}
              className="rounded-full p-2 hover:bg-white/10 disabled:opacity-40"
            >
              <FastForward className="h-5 w-5" fill="currentColor" />
            </button>
            <select
              aria-label={t("languageLabel")}
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value as SpeechLanguage)}
              className="rounded-full border border-white/20 bg-white/10 px-2 py-1.5 text-xs font-medium text-white outline-none"
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="text-gray-900">
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>
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
