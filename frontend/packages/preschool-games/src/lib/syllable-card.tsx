"use client";

import { useState } from "react";
import type { StoryWordSegment } from "./story-parser";

// Shared syllable/letter "card" rendering — originally built for the
// "Казки" (Stories) minigame (docs/preschool/games/reading/Stories.md §3)
// and extracted here so other minigames (e.g. "Jumping Frogs", see docs/
// preschool/games/jumping-frogs.md) can render the exact same cards for
// their own word breakdowns without duplicating this logic. A "text"
// segment that happens to be a known two-letter consonant+vowel syllable
// shows that exact flashcard image from the "Картки" game's asset folder
// (public/static/syllables/<consonant>/<syllable>.png) instead of plain
// text — no need to ask the server which folders are "ready" (see
// /api/cards-game-modes) first, since a missing/not-yet-labeled file just
// 404s and onError falls back to colored letters (vowel red, consonant
// blue, see isVowelUk). An "image"/"audio"/"video"/"youtube" segment only
// makes sense for a caller that has a real story folder to resolve
// filenames against (`storySlug`) — a caller with no such folder (e.g.
// Jumping Frogs, which only ever builds "text" segments) can omit it.

const UK_VOWELS = new Set(["А", "О", "У", "Е", "И", "І", "Я", "Ю", "Є", "Ї"]);

export function isVowelUk(letter: string): boolean {
  return UK_VOWELS.has(letter.toLocaleUpperCase("uk"));
}

function storyAssetUrl(storySlug: string, filename: string): string {
  return `/static/stories/${encodeURIComponent(storySlug)}/${encodeURIComponent(filename)}`;
}

// The fixed small square each card renders at inline, within running text
// (WordCardRow's "sm" row) — deliberately tiny so a word breakdown reads as
// part of the sentence, not a big interruption in it.
export const SM_CARD_SIZE_REM = 2.75; // 44px

// Popup ("lg") cards default to this size for a short 1-2 segment word, but
// shrink for a longer breakdown so the whole row always fits on screen
// without needing to scroll — see lgCardSizeRem below, same linear
// interpolation approach as reading-game.tsx's slotSizeRem.
export const MAX_LG_CARD_REM = 15; // 240px
export const MIN_LG_CARD_REM = 6; // 96px
const MIN_SEGMENTS_FOR_MAX_SIZE = 2;
const MAX_SEGMENTS_FOR_MIN_SIZE = 6;

export function lgCardSizeRem(segmentCount: number): number {
  const clamped = Math.min(MAX_SEGMENTS_FOR_MIN_SIZE, Math.max(MIN_SEGMENTS_FOR_MAX_SIZE, segmentCount));
  const t = (clamped - MIN_SEGMENTS_FOR_MAX_SIZE) / (MAX_SEGMENTS_FOR_MIN_SIZE - MIN_SEGMENTS_FOR_MAX_SIZE);
  return MAX_LG_CARD_REM - t * (MAX_LG_CARD_REM - MIN_LG_CARD_REM);
}

export function WordSegmentCard({
  segment,
  storySlug,
  sizeRem,
  preferPlainText,
  frameless,
}: {
  segment: StoryWordSegment;
  storySlug?: string | null;
  sizeRem: number;
  // Skips the "known two-letter syllable -> flashcard image" lookup below,
  // always rendering plain colored letters instead — for a caller that
  // wants the syllable's *text* only, e.g. Jumping Frogs' level 2, where
  // the flashcard image would carry a small illustration (matching whatever
  // word that syllable begins in the "Картки" game) that doesn't belong
  // next to a pure open-syllable drill.
  preferPlainText?: boolean;
  // Drops this card's own rounded border/background too, leaving just the
  // bare glyphs/image — distinct from WordCardRow's `bare` below, which
  // only skips the *row's* outer sheet. Used by Jumping Frogs' header
  // target display for levels 1/2 (see jumping-frogs-game.tsx's
  // TargetHeaderBar), which wants the plain letter/syllable floating in its
  // own white circle with no second frame around it.
  frameless?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const boxStyle = { width: `${sizeRem}rem`, height: `${sizeRem}rem` };
  const cardClass = `shrink-0 object-cover ${frameless ? "" : "rounded-lg border-2 border-gray-400 bg-white"}`;
  // Scales with the box so a plain-letter card's glyphs stay legible (and
  // don't overflow it) at any sizeRem, not just the two fixed sizes this
  // used to support.
  const fontSizeRem = sizeRem * 0.45;

  if (segment.kind === "image") {
    if (imageFailed || !storySlug) {
      return (
        <span
          aria-hidden="true"
          style={boxStyle}
          className="flex shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400"
        >
          ?
        </span>
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={storyAssetUrl(storySlug, segment.filename)}
        alt=""
        draggable={false}
        style={boxStyle}
        className={cardClass}
        onError={() => setImageFailed(true)}
      />
    );
  }

  if (segment.kind === "audio") {
    // Audio is only meant to appear as its own {...} group (see Stories'
    // isAudio), rendered as StoryAudioButton instead of this card row —
    // this is just a harmless fallback should one ever get mixed into a
    // breakdown.
    return (
      <span
        aria-hidden="true"
        style={boxStyle}
        className="flex shrink-0 items-center justify-center rounded-lg border-2 border-gray-400 bg-white text-lg"
      >
        🔊
      </span>
    );
  }

  if (segment.kind === "video") {
    // Same rationale as the audio fallback above — video is only meant to
    // appear as its own {...} group (see Stories' isVideo), rendered as
    // StoryVideo.
    return (
      <span
        aria-hidden="true"
        style={boxStyle}
        className="flex shrink-0 items-center justify-center rounded-lg border-2 border-gray-400 bg-white text-lg"
      >
        🎬
      </span>
    );
  }

  if (segment.kind === "youtube") {
    // Same rationale as the audio/video fallbacks above — a YouTube link is
    // only meant to appear as its own {...} group (see Stories' isYouTube),
    // rendered as StoryYoutube.
    return (
      <span
        aria-hidden="true"
        style={boxStyle}
        className="flex shrink-0 items-center justify-center rounded-lg border-2 border-gray-400 bg-white text-lg"
      >
        📺
      </span>
    );
  }

  const lower = segment.text.toLocaleLowerCase("uk");
  const canBeCardImage = lower.length === 2 && !imageFailed && !preferPlainText;

  if (canBeCardImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/static/syllables/${encodeURIComponent(lower[0])}/${encodeURIComponent(lower)}.png`}
        alt={segment.text.toLocaleUpperCase("uk")}
        draggable={false}
        style={boxStyle}
        className={cardClass}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      style={{ ...boxStyle, fontSize: `${fontSizeRem}rem` }}
      className={`flex shrink-0 items-center justify-center font-extrabold ${
        frameless ? "" : "rounded-lg border-2 border-gray-400 bg-white"
      }`}
    >
      {[...segment.text.toLocaleUpperCase("uk")].map((letter, index) => (
        <span key={index} style={{ color: isVowelUk(letter) ? "#dc2626" : "#0369a1" }}>
          {letter}
        </span>
      ))}
    </span>
  );
}

// The bordered "sheet" containing every card of one {...} word breakdown,
// in a single row — the same photograph-a-hand-drawn-sheet look as
// public/static/syllables (docs/preschool/games/reading/Stories.md §3), just
// composed live from individual cards instead of being one photo itself.
// `size` picks the sheet's own chrome scale (border/gap/padding) — thin
// inline vs. thick popup; `cardSizeRem` (popup only) shrinks the cards
// themselves for a longer word, see lgCardSizeRem.
export function WordCardRow({
  segments,
  storySlug,
  size,
  cardSizeRem,
  preferPlainText,
  bare,
  frameless,
}: {
  segments: StoryWordSegment[];
  storySlug?: string | null;
  size: "sm" | "lg";
  cardSizeRem?: number;
  preferPlainText?: boolean;
  // Skips this row's own outer bordered "sheet", rendering just the
  // card(s) directly — for a caller whose card already sits inside its own
  // bordered/framed slot (e.g. a single-segment letter/syllable card on a
  // Jumping Frogs lily pad), where the sheet would just be a second,
  // redundant border concentric with that slot's own.
  bare?: boolean;
  // See WordSegmentCard's `frameless` — drops each card's own border/
  // background too, not just this row's outer sheet.
  frameless?: boolean;
}) {
  const resolvedCardSizeRem = cardSizeRem ?? (size === "lg" ? MAX_LG_CARD_REM : SM_CARD_SIZE_REM);
  const cards = segments.map((segment, index) => (
    <WordSegmentCard
      key={index}
      segment={segment}
      storySlug={storySlug}
      sizeRem={resolvedCardSizeRem}
      preferPlainText={preferPlainText}
      frameless={frameless}
    />
  ));

  if (bare) return <>{cards}</>;

  return (
    <span
      className={`inline-flex items-center border-gray-700 bg-white shadow ${
        size === "lg" ? "gap-5 rounded-[1.875rem] border-[10px] p-5" : "gap-1 rounded-xl border-2 p-1"
      }`}
    >
      {cards}
    </span>
  );
}
