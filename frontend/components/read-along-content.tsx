"use client";

import type { RefObject } from "react";
import type { ReadingBlock } from "@/lib/reading-blocks";
import type { SelectionReadTarget } from "@/lib/use-read-along-player";

// Renders a loaded ReadAlongPlayer's content: heading/paragraph/image
// blocks, each sentence its own highlightable span, plus the floating
// "read selection" button that appears once selectionTarget is set (see
// useReadAlongPlayer's selectionchange listener). Shared by
// components/read-along-page.tsx and the lesson wizard's "Матеріали" tab.
export function ReadAlongContent({
  blocks,
  speakingIndex,
  sentenceRefs,
  selectionTarget,
  onReadSelection,
  readSelectionLabel,
  highlightedSentenceIndices,
}: {
  blocks: ReadingBlock[];
  speakingIndex: number | null;
  sentenceRefs: RefObject<Record<number, HTMLSpanElement | null>>;
  selectionTarget: SelectionReadTarget | null;
  onReadSelection: () => void;
  readSelectionLabel: string;
  /** Sentences (by global index) with a persistent highlight, independent of speakingIndex — set by loaded annotations. */
  highlightedSentenceIndices?: Set<number>;
}) {
  let runningIndex = 0;

  return (
    <>
      {selectionTarget && (
        <button
          type="button"
          // Keeps the browser from collapsing the selection on mousedown,
          // which would otherwise clear selectionTarget (via
          // selectionchange) before this button's click ever fires.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onReadSelection}
          style={{
            position: "fixed",
            top: selectionTarget.top,
            left: selectionTarget.left,
            transform: "translate(-50%, -100%)",
          }}
          className="z-50 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-gray-800"
        >
          {readSelectionLabel}
        </button>
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
                const isHighlighted = highlightedSentenceIndices?.has(index) ?? false;
                return (
                  <span
                    key={index}
                    ref={(el) => {
                      sentenceRefs.current[index] = el;
                    }}
                    className={`rounded transition-colors ${
                      isSpeaking ? "bg-yellow-200" : isHighlighted ? "bg-yellow-100" : ""
                    }`}
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
