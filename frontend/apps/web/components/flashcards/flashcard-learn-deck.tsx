"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronLeft, ChevronRight, Flag, RotateCcw, RotateCw } from "lucide-react";

// Physical Q/W key position, matched by the character it actually produces
// under either an English or a Ukrainian keyboard layout (KeyboardEvent's
// `key` already reflects the active layout) — "й"/"ц" are what Q/W type on
// a Ukrainian layout.
const KNOW_KEYS = new Set(["q", "й"]);
const DIFFICULT_KEYS = new Set(["w", "ц"]);
import type { FlashcardItem } from "@/lib/flashcards";
import type { FlashcardStatus } from "@/stores/flashcard-progress-store";
import { playDifficultSound, playKnowSound } from "@/lib/flashcard-sounds";
import { ProgressBar } from "@/components/progress-bar";
import type { CardFaceConfig, CardFlipOrientation } from "./card-face-config";
import { FlipCard } from "./flip-card";

// "Навчання" (Flip Cards) mode, docs/preschool/games/cards.md — a linear,
// browsable deck (← / → below the card, and the same keys on the
// keyboard) rather than a queue that empties: «Складно» (Flag) and «Знаю»
// (Check) mark the current card — persisted across sessions via
// getStatus/onStatusChange (backed by useFlashcardProgressStore) — with a
// short confirmation sound each, but deliberately stay on the same card
// (the student reviews the badge, then moves on with ← / → themselves).
// «Повторити» clears any mark on the current card (back to unmarked) and
// does advance — it's "I'll see this again later", not a judgment to sit
// with. `items` is a snapshot taken once at mount (see
// useState below) — GameSettingsPanel's "only difficult"/"skip known"
// filters recompute the caller's list live as marks change, but this deck
// keeps browsing the set it started with rather than having cards vanish
// out from under the current index; the caller remounts (key includes
// those filters) to pick up a fresh list on the next round, same pattern
// as topic switching.
export function FlashcardLearnDeck({
  items,
  resolveImage,
  frontConfig,
  backConfig,
  flipOrientation,
  getStatus,
  onStatusChange,
}: {
  items: FlashcardItem[];
  resolveImage: (item: FlashcardItem) => string | null;
  frontConfig: CardFaceConfig;
  backConfig: CardFaceConfig;
  flipOrientation: CardFlipOrientation;
  getStatus: (itemId: number) => FlashcardStatus | undefined;
  onStatusChange: (itemId: number, status: FlashcardStatus | null) => void;
}) {
  const t = useTranslations("FlashcardsGame");
  const [deck] = useState(items);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const total = deck.length;
  const current = deck[index];

  const goTo = (nextIndex: number) => {
    setIndex(Math.max(0, Math.min(nextIndex, total)));
    setFlipped(false);
  };
  const goPrevious = () => goTo(index - 1);
  const goNext = () => goTo(index + 1);
  const handleFlip = () => setFlipped((value) => !value);

  // Guarded on `current` so these are safe to wire into the keydown
  // listener below even on a render where the deck is exhausted (the
  // completion screen has no current card to mark).
  const handleRepeat = () => {
    if (!current) return;
    onStatusChange(current.id, null);
    goNext();
  };
  const handleKnow = () => {
    if (!current) return;
    onStatusChange(current.id, "known");
    playKnowSound();
  };
  const handleDifficult = () => {
    if (!current) return;
    onStatusChange(current.id, "difficult");
    playDifficultSound();
  };

  // Left/Right arrow keys mirror the on-screen ← / → buttons, Space mirrors
  // the flip button (and tapping the card itself), Q/W (or their
  // Ukrainian-layout equivalents й/ц) mirror Знаю/Складно — all ignored
  // while a form control has focus (the settings panel's topic <select> or
  // its checkboxes) so this doesn't hijack normal keyboard use there.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const key = e.key.toLowerCase();
      if (e.key === "ArrowLeft") goPrevious();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === " ") {
        e.preventDefault(); // Space would otherwise also scroll the page
        handleFlip();
      } else if (KNOW_KEYS.has(key)) handleKnow();
      else if (DIFFICULT_KEYS.has(key)) handleDifficult();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, total]);

  if (total === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{t("noItemsForFilter")}</p>;
  }

  if (!current) {
    const knownCount = deck.filter((item) => getStatus(item.id) === "known").length;
    const difficultCount = deck.filter((item) => getStatus(item.id) === "difficult").length;
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-xl font-semibold text-slate-900 dark:text-slate-50">{t("deckCompleteTitle")}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("deckSummary", { known: knownCount, difficult: difficultCount, total })}
        </p>
        <button
          type="button"
          onClick={() => goTo(0)}
          className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {t("restartButton")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="w-full max-w-md">
        <ProgressBar
          percent={((index + 1) / total) * 100}
          label={t("learnProgressLabel", { current: index + 1, total })}
          colorful
        />
      </div>

      {/* Keyed by card id so switching cards fully remounts FlipCard (and
          the CardFaceContent instances inside it) instead of reusing the
          same one — otherwise CardFaceContent's own `imageFailed` state
          (set once a broken/missing image 404s) stuck around across cards,
          hiding a perfectly valid image on a card reached after one whose
          image failed to load. */}
      <FlipCard
        key={current.id}
        item={current}
        imageUrl={resolveImage(current)}
        flipped={flipped}
        onToggle={handleFlip}
        flipHintLabel={t("flipHint")}
        frontConfig={frontConfig}
        backConfig={backConfig}
        orientation={flipOrientation}
        status={getStatus(current.id)}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={goPrevious}
          disabled={index === 0}
          aria-label={t("previousCardLabel")}
          title={t("previousCardLabel")}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          onClick={handleFlip}
          aria-label={t("flipHint")}
          title={t("flipHint")}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RotateCw className="size-4" />
        </button>
        <button
          type="button"
          onClick={handleKnow}
          aria-label={t("knowButton")}
          title={t("knowButton")}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950"
        >
          <Check className="size-4" />
        </button>
        <button
          type="button"
          onClick={handleDifficult}
          aria-label={t("difficultButton")}
          title={t("difficultButton")}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
        >
          <Flag className="size-4" />
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label={t("nextCardLabel")}
          title={t("nextCardLabel")}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  );
}
