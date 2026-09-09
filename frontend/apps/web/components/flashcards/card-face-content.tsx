"use client";

import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import type { FlashcardItem } from "@/lib/flashcards";
import { resolveVisibleCardFields, type CardFaceConfig } from "./card-face-config";

// A card's `definition` (docs/preschool/games/cards.md) may be Markdown
// (bold/italics/lists) — rendered without the shared Markdown component's
// (components/markdown.tsx) `.prose` wrapper, which imposes its own text
// color/size and isn't dark-mode aware; block elements instead get `m-0`
// so they inherit whatever color/size the caller already put on the
// wrapping element below, rather than fighting it.
// remark-math + rehype-katex render inline ($...$) and block ($$...$$) math
// formulas (e.g. `$R = \frac{1}{2}d$`), used by subjects like math sets.
const definitionMarkdownComponents: Components = {
  p: ({ children }) => <p className="m-0">{children}</p>,
  ul: ({ children }) => <ul className="m-0 list-disc pl-4 text-left">{children}</ul>,
  ol: ({ children }) => <ol className="m-0 list-decimal pl-4 text-left">{children}</ol>,
};

// Exported for reuse in FlashcardTermsList's rows (Список mode), which
// render a definition in a plain list-row layout rather than a card face.
export function DefinitionMarkdown({ content }: { content: string }) {
  return (
    // KaTeX renders every formula (inline `$...$` or block `$$...$$`) as an
    // inline `.katex` span — force it onto its own centered line regardless
    // of which syntax was used, since defintions write formulas inline
    // (e.g. "... ($R = \frac{1}{2}d$)."). `!important` (Tailwind's `!`
    // prefix) beats katex.min.css's own `.katex` rule at equal specificity.
    <div className="[&_.katex]:!my-1 [&_.katex]:!block [&_.katex]:!text-center">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={definitionMarkdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// Renders one face's worth of a card (docs/preschool/games/cards.md) —
// shared by FlipCard's front/back and, in Тест mode, both the question card
// and every answer option (flashcard-quiz.tsx), so "which fields show
// where" only has one implementation to keep in sync with
// GameSettingsPanel's checkboxes.
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

  const shown = new Set(resolveVisibleCardFields(item, Boolean(imageUrl) && !imageFailed, config));

  return (
    <div className={`flex flex-col items-center text-center ${size === "lg" ? "gap-3" : "gap-1"}`}>
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
