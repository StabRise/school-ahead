"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Flag } from "lucide-react";
import type { FlashcardCategory, FlashcardItem } from "@/lib/flashcards";
import type { FlashcardStatus } from "@/stores/flashcard-progress-store";
import { playDifficultSound, playKnowSound } from "@/lib/flashcard-sounds";
import { DefinitionMarkdown } from "./card-face-content";

type ListFilter = "all" | "known" | "difficult";

// Enlarged view of a term's thumbnail (see FlashcardTermRow) — plain
// @radix-ui/react-dialog, same component every other popup in apps/web
// uses (e.g. components/add-material-dialog.tsx): Escape and a click on
// the overlay both close it for free, no bespoke keydown handler needed.
function ImageLightbox({ image, onClose }: { image: { url: string; alt: string } | null; onClose: () => void }) {
  return (
    <Dialog.Root open={image !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 focus:outline-none"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">{image?.alt}</Dialog.Title>
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.url}
              alt={image.alt}
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FlashcardTermRow({
  item,
  imageUrl,
  status,
  onOpenImage,
  onToggleKnow,
  onToggleDifficult,
}: {
  item: FlashcardItem;
  imageUrl: string | null;
  status: FlashcardStatus | undefined;
  onOpenImage: (url: string, alt: string) => void;
  onToggleKnow: () => void;
  onToggleDifficult: () => void;
}) {
  const t = useTranslations("FlashcardsGame");

  return (
    <li className="flex items-start gap-3 rounded px-1.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
      {imageUrl ? (
        <button
          type="button"
          onClick={() => onOpenImage(imageUrl, item.term)}
          className="shrink-0 cursor-zoom-in"
          aria-label={t("enlargeImageLabel")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="h-11 w-11 rounded-md object-cover" />
        </button>
      ) : (
        <span aria-hidden="true" className="h-11 w-11 shrink-0 rounded-md bg-slate-100 dark:bg-slate-800" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-slate-900 dark:text-slate-50">{item.term}</span>
          {item.translation && <span className="text-sm text-slate-600 dark:text-slate-300">{item.translation}</span>}
        </div>
        {item.definition && (
          <div className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
            <DefinitionMarkdown content={item.definition} />
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onToggleKnow}
          aria-pressed={status === "known"}
          aria-label={t("knowButton")}
          title={t("knowButton")}
          className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
            status === "known"
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950"
          }`}
        >
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleDifficult}
          aria-pressed={status === "difficult"}
          aria-label={t("difficultButton")}
          title={t("difficultButton")}
          className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
            status === "difficult"
              ? "border-amber-600 bg-amber-600 text-white"
              : "border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
          }`}
        >
          <Flag className="size-3.5" />
        </button>
      </div>
    </li>
  );
}

function matchesFilter(status: FlashcardStatus | undefined, filter: ListFilter): boolean {
  if (filter === "all") return true;
  return status === filter;
}

// "Список термінів" (List of terms) mode, docs/preschool/games/cards.md —
// every card grouped by topic, laid out like the subject detail page's
// lesson list (components/subjects/simple-subject-detail-page.tsx: a small
// muted topic label, then a plain divided row list) rather than as
// one-at-a-time cards. Marking Знаю/Складно here toggles (unlike
// FlashcardLearnDeck's one-way buttons) since there's no separate
// "Повторити" control in a list — clicking an already-active mark clears
// it.
export function FlashcardTermsList({
  categories,
  resolveImage,
  getStatus,
  onStatusChange,
}: {
  categories: FlashcardCategory[];
  resolveImage: (item: FlashcardItem) => string | null;
  getStatus: (itemId: number) => FlashcardStatus | undefined;
  onStatusChange: (itemId: number, status: FlashcardStatus | null) => void;
}) {
  const t = useTranslations("FlashcardsGame");
  const [filter, setFilter] = useState<ListFilter>("all");
  const [enlargedImage, setEnlargedImage] = useState<{ url: string; alt: string } | null>(null);

  const visibleGroups = useMemo(
    () =>
      categories.map((category) => ({
        category,
        items: category.items.filter((item) => matchesFilter(getStatus(item.id), filter)),
      })),
    [categories, getStatus, filter],
  );
  const hasAnyTerm = visibleGroups.some((group) => group.items.length > 0);

  const toggleStatus = (itemId: number, target: FlashcardStatus) => {
    const next = getStatus(itemId) === target ? null : target;
    onStatusChange(itemId, next);
    if (next === "known") playKnowSound();
    else if (next === "difficult") playDifficultSound();
  };

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <div className="inline-flex w-fit rounded-md border border-slate-300 p-0.5 text-sm dark:border-slate-600">
        {(["all", "difficult", "known"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={`rounded px-3 py-1 font-medium transition-colors ${
              filter === option
                ? "bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            {t(option === "all" ? "filterAll" : option === "known" ? "filterKnown" : "filterDifficult")}
          </button>
        ))}
      </div>

      {!hasAnyTerm ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("noItemsForFilter")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {visibleGroups.map(
            ({ category, items }) =>
              items.length > 0 && (
                <div key={category.title} className="flex flex-col gap-1">
                  <div className="px-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {category.title}
                  </div>
                  <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                    {items.map((item) => (
                      <FlashcardTermRow
                        key={item.id}
                        item={item}
                        imageUrl={resolveImage(item)}
                        status={getStatus(item.id)}
                        onOpenImage={(url, alt) => setEnlargedImage({ url, alt })}
                        onToggleKnow={() => toggleStatus(item.id, "known")}
                        onToggleDifficult={() => toggleStatus(item.id, "difficult")}
                      />
                    ))}
                  </ul>
                </div>
              ),
          )}
        </div>
      )}

      <ImageLightbox image={enlargedImage} onClose={() => setEnlargedImage(null)} />
    </div>
  );
}
