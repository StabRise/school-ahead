"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BookPlus, Check, Languages, X } from "lucide-react";
import { isTranslatorSupported, translateText } from "@/lib/chrome-translator";
import { DICTIONARY_MAX_WORDS, wordCount } from "@/lib/dictionary-word-count";
import { useAddDictionaryItem } from "@school-ahead/api-client/browser/dictionary/dictionary";
import { useAuthStore } from "@school-ahead/api-client";
import type { SpeechLanguage } from "@school-ahead/api-client";

interface SelectionTarget {
  top: number;
  left: number;
}

// Block-level elements whose text stands in for "the sentence/line the
// selection falls within" — read-along-content.tsx gets this from its
// sentence-indexed ReadingBlock data (see flatSentencesOf), which plain
// markdown has no equivalent of; walking up to the nearest block ancestor
// is a cheap approximation good enough for a dictionary "sample" context.
const SAMPLE_BLOCK_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th";

function getSampleText(): string | undefined {
  const anchor = document.getSelection()?.anchorNode;
  if (!anchor) return undefined;
  const element = anchor instanceof Element ? anchor : anchor.parentElement;
  const block = element?.closest(SAMPLE_BLOCK_SELECTOR);
  return block?.textContent?.trim() || undefined;
}

// A lighter, markdown-agnostic sibling of read-along-content.tsx's
// selection-translate popover — reuses the same translate engine
// (lib/chrome-translator.ts) and the same visual/interaction pattern
// (floating button on selection, translation card with a dictionary/close
// action), but drops everything that depends on that component's
// sentence-indexed ReadingBlock data (sentence-scope translation): this
// wraps arbitrary rendered content (e.g. <Markdown>) where no such
// structure exists, and only ever translates the literal text selected —
// "add to dictionary" uses the nearest block element's text as its
// "sample" context instead of a real sentence split (see getSampleText).
// Selection is scoped to `containerRef` (via Selection.containsNode)
// rather than the whole document, so it doesn't fire for selections made
// elsewhere on the page (e.g. a sibling textarea).
export function TranslatableContent({
  sourceLanguage,
  enableDictionary = true,
  children,
}: {
  sourceLanguage: SpeechLanguage;
  // Off for viewers with no personal dictionary of their own (e.g. a tutor
  // previewing their own lesson's конспект) — the backend endpoint requires
  // a StudentProfile, so showing this button there would just fail.
  enableDictionary?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("ReadAlong");
  const tDict = useTranslations("Dictionary");
  const locale = useLocale() as SpeechLanguage;
  const translateOnSelect = useAuthStore((state) => state.user?.translateOnSelect ?? false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<SelectionTarget | null>(null);
  const [translation, setTranslation] = useState<{ original: string; text: string; loading: boolean; error: boolean } | null>(null);
  const addDictionaryItem = useAddDictionaryItem();
  const [dictionaryItemAdded, setDictionaryItemAdded] = useState(false);

  const canTranslate = sourceLanguage !== locale && isTranslatorSupported();

  useEffect(() => {
    if (!canTranslate) return;

    const handleSelectionChange = () => {
      const selection = document.getSelection();
      if (
        !selection ||
        selection.isCollapsed ||
        selection.rangeCount === 0 ||
        !containerRef.current ||
        !selection.containsNode(containerRef.current, true)
      ) {
        setTarget(null);
        setTranslation(null);
        setDictionaryItemAdded(false);
        return;
      }

      const rect = selection.getRangeAt(0).getBoundingClientRect();
      setTarget({
        top: Math.max(8, rect.top - 10),
        left: Math.min(Math.max(8, rect.left + rect.width / 2), window.innerWidth - 8),
      });
      setTranslation(null);
      setDictionaryItemAdded(false);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [canTranslate]);

  const runTranslation = (text: string) => {
    setTranslation({ original: text, text: "", loading: true, error: false });
    translateText(text, sourceLanguage, locale)
      .then((translated) => setTranslation({ original: text, text: translated, loading: false, error: false }))
      .catch(() => setTranslation({ original: text, text: "", loading: false, error: true }));
  };

  const handleTranslateClick = () => {
    const text = document.getSelection()?.toString().trim();
    if (text) runTranslation(text);
  };

  // Same rationale as read-along-content.tsx: reacts to a selection
  // appearing while "translate on select" is on, rather than translating
  // as a synchronous side effect of rendering.
  useEffect(() => {
    if (!translateOnSelect || !canTranslate || !target) return;
    const text = document.getSelection()?.toString().trim();
    if (!text) return;
    let cancelled = false;
    void (async () => {
      setTranslation({ original: text, text: "", loading: true, error: false });
      try {
        const translated = await translateText(text, sourceLanguage, locale);
        if (!cancelled) setTranslation({ original: text, text: translated, loading: false, error: false });
      } catch {
        if (!cancelled) setTranslation({ original: text, text: "", loading: false, error: true });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, translateOnSelect, canTranslate]);

  // Saves the translated word/phrase to the student's personal dictionary
  // — `sample`/`sample_translation` come from the selection's nearest
  // block element (see getSampleText) rather than a real sentence split,
  // since plain markdown has no sentence indexing to draw on.
  const handleAddToDictionary = () => {
    if (!translation) return;
    const sample = getSampleText() ?? translation.original;
    const { original: text, text: wordTranslation } = translation;

    translateText(sample, sourceLanguage, locale)
      .then((sampleTranslation) => {
        addDictionaryItem.mutate(
          { data: { text, lang: sourceLanguage, translation: wordTranslation, sample, sample_translation: sampleTranslation } },
          { onSuccess: () => setDictionaryItemAdded(true) },
        );
      })
      .catch(() => {});
  };

  const canAddToDictionary =
    enableDictionary &&
    translation !== null &&
    !translation.loading &&
    !translation.error &&
    wordCount(translation.original) >= 1 &&
    wordCount(translation.original) <= DICTIONARY_MAX_WORDS;

  return (
    <div ref={containerRef}>
      {target && canTranslate && (
        <div
          style={{ position: "fixed", top: target.top, left: target.left, transform: "translate(-50%, -100%)" }}
          className="z-50 flex flex-col items-center gap-2"
        >
          {!translateOnSelect && !translation && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleTranslateClick}
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

      {children}
    </div>
  );
}
