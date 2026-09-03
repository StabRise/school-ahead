"use client";

import { useEffect, useState, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BookPlus, Check, Languages, X } from "lucide-react";
import { isTranslatorSupported, translateText } from "@/lib/chrome-translator";
import { useAddDictionaryItem } from "@/lib/api/browser/dictionary/dictionary";
import type { SpeechLanguage } from "@/lib/piper-tts";
import { flatSentencesOf, type ReadingBlock } from "@/lib/reading-blocks";
import type { SelectionReadTarget } from "@/lib/use-read-along-player";
import type { TranslationScope } from "@/stores/auth-store";

const DICTIONARY_MAX_WORDS = 5;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// Renders a loaded ReadAlongPlayer's content: heading/paragraph/image
// blocks, each sentence its own highlightable span, plus the floating
// "translate selection" icon button that appears once selectionTarget is
// set (see useReadAlongPlayer's selectionchange listener) — unless the
// student's translationScope setting is "off". Shared by
// components/read-along-page.tsx and the lesson wizard's "Матеріали" tab.
export function ReadAlongContent({
  blocks,
  speakingIndex,
  sentenceRefs,
  selectionTarget,
  highlightColors,
  sourceLanguage,
  translationScope = "word",
  translateOnSelect = false,
}: {
  blocks: ReadingBlock[];
  speakingIndex: number | null;
  sentenceRefs: RefObject<Record<number, HTMLSpanElement | null>>;
  selectionTarget: SelectionReadTarget | null;
  /** Sentences (by global index) with a persistent highlight color, independent of speakingIndex — set by loaded highlight annotations. */
  highlightColors?: Map<number, string>;
  /** The selected text's language — enables translation (Chrome's built-in on-device Translator API) whenever it differs from the interface language. Omit to hide translation entirely. */
  sourceLanguage?: SpeechLanguage;
  /** Whether a translation covers just the literal selection ("word") or the whole sentence(s) it falls within ("sentence"), or is off entirely ("off") — see the Settings page's "Переклад матеріалів" settings. */
  translationScope?: TranslationScope;
  /** Translates as soon as text is selected instead of waiting for the translate icon button click — same settings section. */
  translateOnSelect?: boolean;
}) {
  const t = useTranslations("ReadAlong");
  const tDict = useTranslations("Dictionary");
  const locale = useLocale() as SpeechLanguage;
  const [translation, setTranslation] = useState<{
    original: string;
    /** The literal substring the student selected — always just the word/phrase, regardless of translationScope. Used for the "add to dictionary" button (both its word-count gating and its `text` field). */
    selectedText: string;
    text: string;
    loading: boolean;
    error: boolean;
  } | null>(null);
  const addDictionaryItem = useAddDictionaryItem();
  const [dictionaryItemAdded, setDictionaryItemAdded] = useState(false);

  // Clears any shown translation (and the "added to dictionary" checkmark)
  // as soon as the selection it was for changes (cleared, or moved to
  // different text) — a render-time state adjustment (see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // rather than an effect, same pattern as lesson-wizard.tsx's landingTabApplied.
  const [lastSelectionTarget, setLastSelectionTarget] = useState(selectionTarget);
  if (selectionTarget !== lastSelectionTarget) {
    setLastSelectionTarget(selectionTarget);
    setTranslation(null);
    setDictionaryItemAdded(false);
  }

  const canTranslate =
    translationScope !== "off" &&
    sourceLanguage !== undefined &&
    sourceLanguage !== locale &&
    isTranslatorSupported();

  const getLiteralSelection = (): string | undefined => window.getSelection()?.toString().trim() || undefined;

  const getFullSentenceText = (): string | undefined => {
    if (!selectionTarget) return undefined;
    const allSentences = flatSentencesOf(blocks);
    return selectionTarget.sentenceIndices.map((index) => allSentences[index]).join(" ");
  };

  // In "word" scope, translates exactly the substring the student
  // highlighted; in "sentence" scope, the whole sentence(s) it falls within
  // (the same set onReadSelection/sentenceIndices reads aloud) — see the
  // Profile page's "Переклад матеріалів" settings.
  const runTranslation = (selectedText: string, textToTranslate: string) => {
    if (!sourceLanguage) return;
    setTranslation({ original: textToTranslate, selectedText, text: "", loading: true, error: false });
    translateText(textToTranslate, sourceLanguage, locale)
      .then((translated) =>
        setTranslation({ original: textToTranslate, selectedText, text: translated, loading: false, error: false }),
      )
      .catch(() => setTranslation({ original: textToTranslate, selectedText, text: "", loading: false, error: true }));
  };

  const handleTranslateSelection = () => {
    const selectedText = getLiteralSelection();
    if (!selectedText) return;
    const textToTranslate = translationScope === "sentence" ? (getFullSentenceText() ?? selectedText) : selectedText;
    runTranslation(selectedText, textToTranslate);
  };

  // Saves the translated word/phrase to the student's personal dictionary
  // (see the icon button below) — `text`/`translation` are always the
  // literal word/phrase (never the full sentence, even in "sentence"
  // scope), while `sample`/`sample_translation` are always the full
  // sentence, reusing whichever of the two is already the current
  // translation result and only fetching the other one fresh.
  const handleAddToDictionary = () => {
    if (!translation || !sourceLanguage) return;
    const sample = getFullSentenceText();
    if (!sample) return;
    const { selectedText } = translation;

    const wordTranslation =
      translationScope === "word" ? Promise.resolve(translation.text) : translateText(selectedText, sourceLanguage, locale);
    const sampleTranslation =
      translationScope === "sentence" ? Promise.resolve(translation.text) : translateText(sample, sourceLanguage, locale);

    Promise.all([wordTranslation, sampleTranslation])
      .then(([wordTranslationResult, sampleTranslationResult]) => {
        addDictionaryItem.mutate(
          {
            data: {
              text: selectedText,
              lang: sourceLanguage,
              translation: wordTranslationResult,
              sample,
              sample_translation: sampleTranslationResult,
            },
          },
          { onSuccess: () => setDictionaryItemAdded(true) },
        );
      })
      .catch(() => {});
  };

  // Auto-translates as soon as a new selection appears when the student has
  // turned that setting on — reacting to selectionTarget/translateOnSelect
  // changing is exactly what an effect is for; the async translateText call
  // (and its setTranslation calls) live inside a nested function rather
  // than directly in the effect body so a render never synchronously
  // triggers a translation as a side effect of just rendering.
  useEffect(() => {
    if (!translateOnSelect || !canTranslate || !selectionTarget) return;
    const selectedText = getLiteralSelection();
    if (!selectedText) return;
    const textToTranslate = translationScope === "sentence" ? (getFullSentenceText() ?? selectedText) : selectedText;
    let cancelled = false;
    void (async () => {
      setTranslation({ original: textToTranslate, selectedText, text: "", loading: true, error: false });
      try {
        const translated = await translateText(textToTranslate, sourceLanguage!, locale);
        if (!cancelled) {
          setTranslation({ original: textToTranslate, selectedText, text: translated, loading: false, error: false });
        }
      } catch {
        if (!cancelled) setTranslation({ original: textToTranslate, selectedText, text: "", loading: false, error: true });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only selectionTarget identity should re-trigger this — the other
    // dependencies (translateOnSelect, canTranslate, sourceLanguage,
    // locale, translationScope, blocks) don't change mid-selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionTarget, translateOnSelect, canTranslate]);

  const canAddToDictionary =
    translation !== null &&
    !translation.loading &&
    !translation.error &&
    wordCount(translation.selectedText) >= 1 &&
    wordCount(translation.selectedText) <= DICTIONARY_MAX_WORDS;

  let runningIndex = 0;

  return (
    <>
      {selectionTarget && canTranslate && (
        <div
          style={{
            position: "fixed",
            top: selectionTarget.top,
            left: selectionTarget.left,
            transform: "translate(-50%, -100%)",
          }}
          className="z-50 flex flex-col items-center gap-2"
        >
          {!translateOnSelect && !translation && (
            <button
              type="button"
              // Keeps the browser from collapsing the selection on
              // mousedown, which would otherwise clear selectionTarget (via
              // selectionchange) before this button's click ever fires.
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleTranslateSelection}
              aria-label={t("translateSelectionButton")}
              title={t("translateSelectionButton")}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-800"
            >
              <Languages className="size-4" />
            </button>
          )}

          {translation && (
            <div className="flex w-64 flex-col gap-1 rounded-md bg-white p-3 text-left text-sm text-gray-900 shadow-lg ring-1 ring-gray-200">
              <div className="flex items-start gap-2">
                <mark className="rounded bg-yellow-200 px-1 font-medium">{translation.original}</mark>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  {canAddToDictionary && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleAddToDictionary}
                      disabled={addDictionaryItem.isPending || dictionaryItemAdded}
                      aria-label={tDict("addButton")}
                      title={tDict("addButton")}
                      className="text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed"
                    >
                      {dictionaryItemAdded ? (
                        <Check className="size-4 text-green-600" />
                      ) : (
                        <BookPlus className="size-4" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setTranslation(null)}
                    aria-label={t("closeTranslation")}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
              {translation.loading ? (
                <span className="text-gray-500">{t("translating")}</span>
              ) : translation.error ? (
                <span className="text-red-600">{t("translateError")}</span>
              ) : (
                <span>{translation.text}</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-md border border-gray-200 p-6 text-lg leading-relaxed">
        {blocks.map((block, blockIndex) => {
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
                const isSpeaking = index === speakingIndex;
                const highlightColor = highlightColors?.get(index);
                return (
                  <span
                    key={index}
                    ref={(el) => {
                      sentenceRefs.current[index] = el;
                    }}
                    className={`rounded transition-colors ${isSpeaking ? "bg-yellow-200" : ""}`}
                    // The "currently speaking" highlight (className above)
                    // always wins over a persistent highlight color — an
                    // inline style would otherwise override that class for
                    // the same sentence.
                    style={!isSpeaking && highlightColor ? { backgroundColor: highlightColor } : undefined}
                  >
                    {sentence}{" "}
                  </span>
                );
              })}
            </Tag>
          );
        })}
      </div>
    </>
  );
}
