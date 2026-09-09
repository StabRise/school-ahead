"use client";

import type { FlashcardItem } from "@/lib/flashcards";
import type { FlashcardStatus } from "@/stores/flashcard-progress-store";
import type { CardFaceConfig, CardFlipOrientation } from "./card-face-config";
import { CardFaceContent } from "./card-face-content";
import { StatusBadge } from "./status-badge";

// One study flashcard (docs/preschool/games/cards.md) — click/tap flips it
// via a real 3D transform (front/back are two absolutely-positioned faces
// sharing the same box, [backface-visibility:hidden] hiding whichever one
// is turned away from the viewer) rather than a fade or a layout swap. The
// box itself scales with the viewport rather than a single fixed size, so
// it isn't oversized on a small phone screen or cramped on a desktop one.
// What each face actually shows is fully configurable (CardFaceContent +
// GameSettingsPanel) rather than hardcoded to term/image front,
// translation/definition back. `orientation` (a GameSettingsPanel choice,
// persisted in stores/flashcards-store.ts) picks both the card's own shape
// and which axis it flips around, paired so the flip always spins around
// the card's *short* side (the least distorted-looking rotation): a
// landscape "horizontal" card (wide X, short Y) turns around a horizontal
// line — up/down, like a coin toss; a portrait "vertical" card (narrow X,
// tall Y) turns around a vertical line — left/right, like a page. The back
// face's own static rotation must match, or it wouldn't land right-side-up
// once the flip completes. Deliberately adult/minimalist (slate palette,
// no gradients, no mascots, no bounce easing) per the doc's "Дорослий
// дизайн" requirement — unlike every @school-ahead/preschool-games card,
// which is bright and playful for a much younger audience.
export function FlipCard({
  item,
  imageUrl,
  flipped,
  onToggle,
  flipHintLabel,
  frontConfig,
  backConfig,
  orientation,
  status,
}: {
  item: FlashcardItem;
  imageUrl: string | null;
  flipped: boolean;
  onToggle: () => void;
  flipHintLabel: string;
  frontConfig: CardFaceConfig;
  backConfig: CardFaceConfig;
  orientation: CardFlipOrientation;
  status?: FlashcardStatus;
}) {
  const isHorizontal = orientation === "horizontal";
  const axis = isHorizontal ? "X" : "Y";
  // Landscape (wide X, short Y) for "horizontal"; portrait (narrow X, tall
  // Y) for "vertical" — each breakpoint's pair keeps roughly the same
  // aspect ratio as the viewport grows.
  const widthClasses = isHorizontal ? "max-w-md sm:max-w-xl md:max-w-2xl" : "max-w-xs sm:max-w-sm md:max-w-md";
  const heightClasses = isHorizontal ? "h-72 sm:h-80 md:h-96" : "h-96 sm:h-[28rem] md:h-[32rem]";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={flipHintLabel}
      className={`relative block w-full cursor-pointer [perspective:1200px] ${widthClasses}`}
    >
      {/* Pinned to the outer (non-rotating) wrapper, not either face, so
          the "Знаю"/"Складно" mark stays visible regardless of which side
          is currently up. */}
      <StatusBadge status={status} className="absolute right-3 top-3 z-10 h-8 w-8" />

      <div
        className={`relative w-full transition-transform duration-500 ease-out [transform-style:preserve-3d] ${heightClasses}`}
        style={{ transform: flipped ? `rotate${axis}(180deg)` : `rotate${axis}(0deg)` }}
      >
        {/* `overflow-y-auto` lives on an inner wrapper, not on this face
            div itself — Chrome/Safari both ignore `backface-visibility:
            hidden` on an element that also sets `overflow` to anything but
            its default `visible`, so putting both on the same node made
            the away-facing side show through (most visible with rotateX,
            since the flip's own vertical motion fights the vertical
            scroll clipping). */}
        <div className="absolute inset-0 rounded-2xl border border-slate-200 bg-white shadow-sm [backface-visibility:hidden] dark:border-slate-700 dark:bg-slate-900">
          <div className="flex h-full flex-col items-center justify-center gap-3 overflow-y-auto p-8">
            <CardFaceContent item={item} imageUrl={imageUrl} config={frontConfig} size="lg" />
            <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{flipHintLabel}</p>
          </div>
        </div>

        <div
          className="absolute inset-0 rounded-2xl border border-slate-200 bg-slate-50 shadow-sm [backface-visibility:hidden] dark:border-slate-700 dark:bg-slate-800"
          style={{ transform: `rotate${axis}(180deg)` }}
        >
          <div className="flex h-full flex-col items-center justify-center gap-3 overflow-y-auto p-8">
            <CardFaceContent item={item} imageUrl={imageUrl} config={backConfig} size="lg" />
          </div>
        </div>
      </div>
    </button>
  );
}
