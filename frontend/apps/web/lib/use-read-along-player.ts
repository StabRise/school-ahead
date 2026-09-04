"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { prefetchVoice, speakSequence, type SpeechLanguage } from "@school-ahead/api-client";
import { flatSentencesOf, paragraphRangesOf, type ReadingBlock } from "@/lib/reading-blocks";

// Where to float the "Прочитати" button once a selection covering at least
// one rendered sentence exists, and which of those sentences (by their
// global index into flatSentencesOf(readingBlocks) — the same indexing
// sentenceRefs and speakingIndex already use) it should read.
export interface SelectionReadTarget {
  top: number;
  left: number;
  sentenceIndices: number[];
}

export interface ReadAlongPlayer {
  readingBlocks: ReadingBlock[];
  readingTitle: string | null;
  language: SpeechLanguage;
  speakingIndex: number | null;
  currentParagraphIndex: number;
  paragraphCount: number;
  selectionTarget: SelectionReadTarget | null;
  sentenceRefs: React.RefObject<Record<number, HTMLSpanElement | null>>;
  /** Loads new content and resets all playback/selection state — does not start speaking on its own. */
  load: (blocks: ReadingBlock[], language: SpeechLanguage, title?: string | null) => void;
  stop: () => void;
  playFromStart: () => void;
  playPreviousParagraph: () => void;
  playNextParagraph: () => void;
  /** Reads back the current text selection (see selectionTarget); no-op if there isn't one. */
  playSelection: () => void;
  /** Resumes from currentParagraphIndex if stopped, reads the current selection if one exists, or stops if already playing. */
  playPause: () => void;
  changeLanguage: (language: SpeechLanguage) => void;
  /** Clears the current text selection without reading it — used by annotation actions (highlight/comment) that consume selectionTarget for its sentence range but shouldn't trigger playback. */
  clearSelection: () => void;
}

// Owns every piece of state a read-along-style viewer needs: which content
// is loaded, playback position/highlight, paragraph navigation, and the
// "select text to read/highlight/comment" mechanism — shared by
// components/read-along-page.tsx (paste text or a link) and the lesson
// wizard's "Матеріали" tab (components/lesson-wizard/materials-step.tsx).
// `enabled` gates the selectionchange listener — pass false while this
// player's content isn't actually mounted/visible.
export function useReadAlongPlayer(enabled: boolean): ReadAlongPlayer {
  const [readingBlocks, setReadingBlocks] = useState<ReadingBlock[]>([]);
  const [readingTitle, setReadingTitle] = useState<string | null>(null);
  const [language, setLanguage] = useState<SpeechLanguage>("pl");
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
  const [selectionTarget, setSelectionTarget] = useState<SelectionReadTarget | null>(null);
  const languageRef = useRef<SpeechLanguage>("pl");
  const sentenceRefs = useRef<Record<number, HTMLSpanElement | null>>({});

  const paragraphRanges = useMemo(() => paragraphRangesOf(readingBlocks), [readingBlocks]);

  // Keeps the currently-spoken sentence in view for a long, scrolled article.
  useEffect(() => {
    if (speakingIndex === null) return;
    sentenceRefs.current[speakingIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [speakingIndex]);

  // speakSequence()'s onProgress hands back a global sentence index (or null
  // once it's done) — this both drives the highlight (speakingIndex) and,
  // while playing, keeps currentParagraphIndex in sync with wherever
  // playback actually is, so previous/next stay relative to real progress
  // instead of where navigation last jumped to.
  const applyProgress = (globalIndex: number | null) => {
    setSpeakingIndex(globalIndex);
    if (globalIndex === null) return;
    const paragraphIndex = paragraphRanges.findIndex((range) => globalIndex >= range.start && globalIndex < range.end);
    if (paragraphIndex !== -1) setCurrentParagraphIndex(paragraphIndex);
  };

  // Selecting any part of the rendered text surfaces a floating "Прочитати"
  // button (see selectionTarget) — a <textarea>'s own selection never
  // reaches document.getSelection(), so this naturally never fires while
  // showing an input form instead of rendered content.
  useEffect(() => {
    if (!enabled) return;

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
  }, [enabled]);

  const load = (blocks: ReadingBlock[], fromLanguage: SpeechLanguage, title: string | null = null) => {
    sentenceRefs.current = {};
    setSelectionTarget(null);
    setReadingBlocks(blocks);
    setReadingTitle(title);
    setCurrentParagraphIndex(0);
    setSpeakingIndex(null);
    setLanguage(fromLanguage);
    languageRef.current = fromLanguage;
    void prefetchVoice(fromLanguage);
  };

  const stop = () => {
    void speakSequence([], languageRef.current);
    setSpeakingIndex(null);
  };

  // Starts speaking from the given paragraph's first sentence through to the
  // end of the content (not just that one paragraph) — the usual
  // previous/next-track behavior in a media player, just at paragraph
  // granularity.
  const playFromParagraph = (paragraphIndex: number) => {
    const range = paragraphRanges[paragraphIndex];
    if (!range) return;
    setCurrentParagraphIndex(paragraphIndex);
    const remainingSentences = flatSentencesOf(readingBlocks).slice(range.start);
    void speakSequence(remainingSentences, languageRef.current, (localIndex) => {
      applyProgress(localIndex === null ? null : range.start + localIndex);
    });
  };

  // Reads back only the sentences the current selection covers: clears the
  // selection, then speaks those sentences via the same speakSequence()
  // (which cuts off anything already playing) — its onProgress index is
  // local to this subset, so it's mapped back through sentenceIndices to the
  // global index speakingIndex/sentenceRefs already key their highlight off.
  const playSelection = () => {
    if (!selectionTarget) return;
    const { sentenceIndices } = selectionTarget;
    window.getSelection()?.removeAllRanges();
    setSelectionTarget(null);
    const allSentences = flatSentencesOf(readingBlocks);
    const texts = sentenceIndices.map((index) => allSentences[index]);
    void speakSequence(texts, languageRef.current, (localIndex) => {
      applyProgress(localIndex === null ? null : sentenceIndices[localIndex]);
    });
  };

  // The panel's play button reads back the current selection instead of
  // resuming from currentParagraphIndex when one is active — same as
  // tapping the floating "Прочитати" button next to the selection.
  const playPause = () => {
    if (speakingIndex !== null) stop();
    else if (selectionTarget) playSelection();
    else playFromParagraph(currentParagraphIndex);
  };

  const playFromStart = () => playFromParagraph(0);
  const playPreviousParagraph = () => playFromParagraph(Math.max(0, currentParagraphIndex - 1));
  const playNextParagraph = () => playFromParagraph(Math.min(paragraphRanges.length - 1, currentParagraphIndex + 1));

  // Switching language mid-reading stops playback rather than letting the
  // in-flight utterance finish in the old voice — voiceIdFor()
  // (lib/piper-tts.ts) is only consulted at the start of each
  // speakSequence() call, so the current sentence wouldn't switch voice
  // anyway, and continuing to speak in a since-changed language would be
  // confusing.
  const changeLanguage = (newLanguage: SpeechLanguage) => {
    stop();
    setLanguage(newLanguage);
    languageRef.current = newLanguage;
    void prefetchVoice(newLanguage);
  };

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelectionTarget(null);
  };

  return {
    readingBlocks,
    readingTitle,
    language,
    speakingIndex,
    currentParagraphIndex,
    paragraphCount: paragraphRanges.length,
    selectionTarget,
    sentenceRefs,
    load,
    stop,
    playFromStart,
    playPreviousParagraph,
    playNextParagraph,
    playSelection,
    playPause,
    changeLanguage,
    clearSelection,
  };
}
