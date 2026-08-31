"use client";

import { useState } from "react";

// Every card is this wide — and, via aspect-square below, this tall too —
// with CSS grid's `auto-fit` deciding how many fit per row at the current
// screen width (no JS breakpoint logic needed). The grid's own max-width is
// then capped (see gridMaxWidthPx) so a small set doesn't stretch every
// card oversized across a wide screen instead of leaving margins.
const CARD_WIDTH_PX = 200;
const GRID_GAP_PX = 16; // matches the grid's gap-4

// Columns to target for ~2 rows on a wide screen (more for a bigger set,
// capped at 6 so cards never get silly-narrow) — only used to size the
// grid's max-width; auto-fit still reduces the actual column count further
// on a narrower screen.
function idealColumns(itemCount: number): number {
  return Math.min(6, Math.max(2, Math.ceil(itemCount / 2)));
}

function gridMaxWidthPx(itemCount: number): number {
  const columns = idealColumns(itemCount);
  return columns * CARD_WIDTH_PX + (columns - 1) * GRID_GAP_PX;
}

// "Навчання" (learning) screen for balloon-pop-game.tsx's picture-pool
// modes (animals/schoolSuppliesEx/family/bodyParts/fruits) — a static
// grid instead of falling balloons, so a child can tap each item at their
// own pace and hear its name as many times as they like. `items` is the
// same fixed subset the "game" (balloon) screen draws from for this
// mode/cardCount (see selectedPictureItems in balloon-pop-game.tsx), so
// switching between the two screens never reshuffles the vocabulary.
export function BalloonLearningCards({
  items,
  muted,
  onPlay,
}: {
  items: { name: string; image: string }[];
  muted: boolean;
  // Speaks `name` — the caller decides between a recorded pronunciation and
  // Piper TTS (see useRecordedSoundNames in lib/preschool-sounds.ts).
  onPlay: (name: string) => void;
}) {
  const [activeName, setActiveName] = useState<string | null>(null);

  const handleCardClick = (item: { name: string; image: string }) => {
    setActiveName(item.name);
    if (!muted) onPlay(item.name);
  };

  return (
    // No z-index (unlike the score badge/settings/music buttons/toggle,
    // which are all z-10) — it needs to sit *below* those always-visible
    // floating controls, not cover them, the same way falling balloons
    // (also z-index:auto) already do.
    <div className="absolute inset-0 flex justify-center overflow-y-auto bg-gradient-to-b from-sky-50 to-emerald-50 p-6 pt-20">
      <div
        className="grid w-full content-start gap-4"
        style={{
          maxWidth: gridMaxWidthPx(items.length),
          gridTemplateColumns: `repeat(auto-fit, minmax(${CARD_WIDTH_PX}px, 1fr))`,
        }}
      >
        {items.map((item) => (
          <button
            key={item.name}
            type="button"
            onClick={() => handleCardClick(item)}
            // select-none + touch-manipulation stop a child's tap-and-
            // slightly-drag finger motion from being read as a text/image
            // selection drag instead of a tap — that stolen gesture is what
            // was highlighting the picture and making the click flaky.
            // [-webkit-touch-callout:none] kills iOS's long-press "Save
            // Image" callout for the same reason.
            className={`flex aspect-square touch-manipulation select-none flex-col items-center justify-center gap-2 rounded-2xl border-4 bg-white p-3 shadow-md transition-transform active:scale-95 [-webkit-touch-callout:none] ${
              activeName === item.name ? "border-sky-400 ring-4 ring-sky-200" : "border-transparent"
            }`}
          >
            {/* Fixed size, decoupled from the (square) card's own size — a
                bigger card shouldn't get a bigger image with no room left
                for its name below it. */}
            <span className="h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image}
                alt=""
                draggable={false}
                className="h-full w-full select-none rounded-xl object-cover"
              />
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm shadow"
              >
                🔊
              </span>
            </span>
            {/* `capitalize` rather than fixing the data itself — the
                picture pools (e.g. BALLOON_ANIMALS) mix "Bear" and
                "fox"-style casing, and this reads correctly regardless. */}
            <span className="truncate text-base font-bold capitalize text-gray-800">{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
