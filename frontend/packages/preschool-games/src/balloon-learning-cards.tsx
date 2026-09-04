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

export interface LearningCard {
  // Canonical name — stable identity for the card, used as the React key
  // and to look up its recorded pronunciation (see PreschoolCard.key in
  // lib/preschool-sounds.ts). Not necessarily what's shown/spoken.
  key: string;
  // Display/speech text — the card's translated name for the current game
  // language if one exists (see resolveCardName in lib/preschool-sounds.ts),
  // otherwise the same as `key`.
  name: string;
  image?: string;
}

// "Навчання" (learning) screen for balloon-pop-game.tsx — every mode gets
// one now, driven entirely by that mode's folder under public/preschool/
// balloon-game (see PreschoolModeData in lib/preschool-sounds.ts): a static
// grid instead of falling balloons, so a child can tap each item at their
// own pace and hear its name as many times as they like. `items` is the
// same fixed subset the "game" (balloon) screen draws from for this
// mode/cardCount (see displayCards in balloon-pop-game.tsx), so switching
// between the two screens never reshuffles the vocabulary. A card with no
// `image` (e.g. every number mode) shows its name itself, big, instead of
// a photo.
export function BalloonLearningCards({
  items,
  muted,
  onPlay,
  onCardLearned,
}: {
  items: LearningCard[];
  muted: boolean;
  // Speaks the card — the caller decides between a recorded pronunciation
  // and Piper TTS (see PreschoolModeData.sounds in lib/preschool-sounds.ts).
  onPlay: (card: LearningCard) => void;
  // Fired on every tap, repeats included — lets the caller award the same
  // ruby a popped balloon gives (see balloon-pop-game.tsx's
  // handleCardLearned).
  onCardLearned?: (card: LearningCard) => void;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const handleCardClick = (item: LearningCard) => {
    setActiveKey(item.key);
    if (!muted) onPlay(item);
    onCardLearned?.(item);
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
            key={item.key}
            type="button"
            onClick={() => handleCardClick(item)}
            // select-none + touch-manipulation stop a child's tap-and-
            // slightly-drag finger motion from being read as a text/image
            // selection drag instead of a tap — that stolen gesture is what
            // was highlighting the picture and making the click flaky.
            // [-webkit-touch-callout:none] kills iOS's long-press "Save
            // Image" callout for the same reason.
            className={`flex aspect-square touch-manipulation select-none flex-col items-center justify-center gap-2 rounded-2xl border-4 bg-white p-3 shadow-md transition-transform active:scale-95 [-webkit-touch-callout:none] ${
              activeKey === item.key ? "border-sky-400 ring-4 ring-sky-200" : "border-transparent"
            }`}
          >
            {/* Fixed size, decoupled from the (square) card's own size — a
                bigger card shouldn't get a bigger image with no room left
                for its name below it. */}
            <span className="h-full w-full">
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image}
                  alt=""
                  draggable={false}
                  className="h-full w-full select-none rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-xl bg-sky-50 text-6xl font-extrabold text-sky-700">
                  {item.name}
                </div>
              )}
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm shadow"
              >
                🔊
              </span>
            </span>
            {/* Image-less cards skip this — the big name on the card itself
                already is the label, so repeating it below would be
                redundant. `capitalize` is a safety net for picture cards —
                a card's name is whatever its image file is named (see
                /api/preschool-mode), so an inconsistently-cased upload
                still reads correctly. */}
            {item.image && (
              <span className="truncate text-base font-bold capitalize text-gray-800">{item.name}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
