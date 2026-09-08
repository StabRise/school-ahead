"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { FlashcardItem } from "@/lib/flashcards";
import type { CardFaceConfig } from "./card-face-config";
import { FlipCard } from "./flip-card";

// "Навчання" (Flip Cards) mode, docs/preschool/games/cards.md — one card at
// a time; flipping it reveals the back face (what each face shows is
// configurable, see GameSettingsPanel), then «Знаю» / «Повторити»
// sorts it: known cards drop out of the queue, "repeat" ones go to the back
// of it, so the deck is done exactly when every card has been marked known
// at least once. `items` is a snapshot taken once at mount — the caller
// remounts this (key={topic}) rather than syncing state to a changed prop,
// per https://react.dev/learn/you-might-not-need-an-effect.
export function FlashcardLearnDeck({
  items,
  resolveImage,
  frontConfig,
  backConfig,
}: {
  items: FlashcardItem[];
  resolveImage: (item: FlashcardItem) => string | null;
  frontConfig: CardFaceConfig;
  backConfig: CardFaceConfig;
}) {
  const t = useTranslations("FlashcardsGame");
  const [queue, setQueue] = useState<FlashcardItem[]>(items);
  const [knownCount, setKnownCount] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const total = items.length;
  const current = queue[0];

  if (total === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{t("noItemsForTopic")}</p>;
  }

  const advance = (nextQueue: FlashcardItem[]) => {
    setQueue(nextQueue);
    setFlipped(false);
  };

  const handleKnow = () => {
    setKnownCount((count) => count + 1);
    advance(queue.slice(1));
  };

  const handleRepeat = () => {
    advance(queue.length > 1 ? [...queue.slice(1), queue[0]] : queue);
  };

  const handleRestart = () => {
    setKnownCount(0);
    advance(items);
  };

  if (!current) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-xl font-semibold text-slate-900 dark:text-slate-50">{t("deckCompleteTitle")}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("deckCompleteSubtitle", { total })}</p>
        <button
          type="button"
          onClick={handleRestart}
          className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {t("restartButton")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="w-full max-w-md">
        <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          {t("progressLabel", { known: knownCount, total })}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-slate-900 transition-all dark:bg-slate-50"
            style={{ width: `${(knownCount / total) * 100}%` }}
          />
        </div>
      </div>

      <FlipCard
        item={current}
        imageUrl={resolveImage(current)}
        flipped={flipped}
        onToggle={() => setFlipped((value) => !value)}
        flipHintLabel={t("flipHint")}
        frontConfig={frontConfig}
        backConfig={backConfig}
      />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleRepeat}
          className="rounded-full border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {t("repeatButton")}
        </button>
        <button
          type="button"
          onClick={handleKnow}
          className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {t("knowButton")}
        </button>
      </div>
    </div>
  );
}
