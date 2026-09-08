"use client";

import type { FlashcardItem } from "@/lib/flashcards";
import type { CardFaceConfig } from "./card-face-config";
import { CardFaceContent } from "./card-face-content";

// One study flashcard (docs/preschool/games/cards.md) — click/tap flips it
// via a real 3D transform (front/back are two absolutely-positioned faces
// sharing the same box, [backface-visibility:hidden] hiding whichever one
// is turned away from the viewer) rather than a fade or a layout swap.
// What each face actually shows is fully configurable (CardFaceContent +
// CardFaceSettingsPanel) rather than hardcoded to term/image front,
// translation/definition back. Deliberately adult/minimalist (slate
// palette, no gradients, no mascots, no bounce easing) per the doc's
// "Дорослий дизайн" requirement — unlike every @school-ahead/preschool-games
// card, which is bright and playful for a much younger audience.
export function FlipCard({
  item,
  imageUrl,
  flipped,
  onToggle,
  flipHintLabel,
  frontConfig,
  backConfig,
}: {
  item: FlashcardItem;
  imageUrl: string | null;
  flipped: boolean;
  onToggle: () => void;
  flipHintLabel: string;
  frontConfig: CardFaceConfig;
  backConfig: CardFaceConfig;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={flipHintLabel}
      className="block w-full max-w-md cursor-pointer [perspective:1200px]"
    >
      <div
        className="relative h-80 w-full transition-transform duration-500 ease-out [transform-style:preserve-3d]"
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-sm [backface-visibility:hidden] dark:border-slate-700 dark:bg-slate-900">
          <CardFaceContent item={item} imageUrl={imageUrl} config={frontConfig} size="lg" />
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{flipHintLabel}</p>
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm [backface-visibility:hidden] dark:border-slate-700 dark:bg-slate-800 [transform:rotateY(180deg)]">
          <CardFaceContent item={item} imageUrl={imageUrl} config={backConfig} size="lg" />
        </div>
      </div>
    </button>
  );
}
