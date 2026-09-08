"use client";

import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { FlashcardItem } from "@/lib/flashcards";
import { CARD_FIELDS, type CardField, type CardFaceConfig } from "./card-face-config";

// A card's `definition` (docs/preschool/games/cards.md) may be Markdown
// (bold/italics/lists) — rendered without the shared Markdown component's
// (components/markdown.tsx) `.prose` wrapper, which imposes its own text
// color/size and isn't dark-mode aware; block elements instead get `m-0`
// so they inherit whatever color/size the caller already put on the
// wrapping element below, rather than fighting it.
const definitionMarkdownComponents: Components = {
  p: ({ children }) => <p className="m-0">{children}</p>,
  ul: ({ children }) => <ul className="m-0 list-disc pl-4 text-left">{children}</ul>,
  ol: ({ children }) => <ol className="m-0 list-decimal pl-4 text-left">{children}</ol>,
};

// Exported for reuse in FlashcardTermsList's rows (Список mode), which
// render a definition in a plain list-row layout rather than a card face.
export function DefinitionMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={definitionMarkdownComponents}>
      {content}
    </ReactMarkdown>
  );
}

// Renders one face's worth of a card (docs/preschool/games/cards.md) —
// shared by FlipCard's front/back and, in Тест mode, both the question card
// and every answer option (flashcard-quiz.tsx), so "which fields show
// where" only has one implementation to keep in sync with
// GameSettingsPanel's checkboxes.
//
// A field the student configured for this face but that this particular
// card doesn't have (e.g. "translation" checked, but this card has none)
// falls back to whichever fields the card *does* have, same
// graceful-degradation rule the doc applies to a missing image — a
// configured-but-empty face never renders blank as long as the card has
// anything at all to show.
function isFieldAvailable(item: FlashcardItem, imageUrl: string | null, imageFailed: boolean, field: CardField): boolean {
  if (field === "term") return true;
  if (field === "translation") return Boolean(item.translation);
  if (field === "definition") return Boolean(item.definition);
  return Boolean(imageUrl) && !imageFailed;
}

export function CardFaceContent({
  item,
  imageUrl,
  config,
  size = "lg",
}: {
  item: FlashcardItem;
  imageUrl: string | null;
  config: CardFaceConfig;
  size?: "lg" | "sm";
}) {
  const [imageFailed, setImageFailed] = useState(false);

  const wanted = CARD_FIELDS.filter((field) => config[field]);
  let toShow = wanted.filter((field) => isFieldAvailable(item, imageUrl, imageFailed, field));
  if (toShow.length === 0) {
    toShow = CARD_FIELDS.filter((field) => isFieldAvailable(item, imageUrl, imageFailed, field));
  }
  const shown = new Set(toShow);

  return (
    <div className={`flex flex-col items-center text-center ${size === "lg" ? "gap-3" : "gap-1"}`}>
      {shown.has("image") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl ?? undefined}
          alt=""
          draggable={false}
          onError={() => setImageFailed(true)}
          className={
            size === "lg"
              ? "max-h-32 max-w-full rounded-lg object-contain"
              : "max-h-16 max-w-full rounded-md object-contain"
          }
        />
      )}
      {shown.has("term") && (
        <p
          className={
            size === "lg"
              ? "text-2xl font-semibold text-slate-900 dark:text-slate-50"
              : "text-base font-semibold text-slate-900 dark:text-slate-50"
          }
        >
          {item.term}
        </p>
      )}
      {shown.has("translation") && (
        <p
          className={
            size === "lg"
              ? "text-2xl font-semibold text-slate-900 dark:text-slate-50"
              : "text-base font-medium text-slate-800 dark:text-slate-100"
          }
        >
          {item.translation}
        </p>
      )}
      {shown.has("definition") && item.definition && (
        <div
          className={
            size === "lg"
              ? "text-sm leading-relaxed text-slate-600 dark:text-slate-300"
              : "text-xs leading-snug text-slate-600 dark:text-slate-300"
          }
        >
          <DefinitionMarkdown content={item.definition} />
        </div>
      )}
    </div>
  );
}
