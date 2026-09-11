"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, TransitionEvent } from "react";
import { useTranslations } from "next-intl";
import { useRewardJumpingFrogs } from "@school-ahead/api-client/browser/auth/auth";
import { prefetchVoice, speak, warmupSpeech } from "@school-ahead/api-client";
import {
  playCardSound,
  sortConsonants,
  useReadingGameConsonants,
  useReadingGameLevel,
  type ReadingGameCard,
} from "./lib/reading-game";
import {
  buildLetterLevel,
  buildLevel,
  buildSyllableLevel,
  splitUkrainianSyllables,
  type JumpingFrogsLevelContent,
  type JumpingFrogsRow,
} from "./lib/jumping-frogs-game";
import { WordCardRow } from "./lib/syllable-card";
import { useJumpingFrogsStore, type JumpingFrogsDifficulty } from "./stores/jumping-frogs-store";
import { useBackgroundMusic } from "./lib/use-background-music";
import { useDiamondMilestoneReward } from "./kit/use-diamond-milestone-reward";
import { playCelebrationChime, playFrogJumpSound, playFrogMissSound } from "./kit/sound-effects";
import { MusicToggleButton } from "./kit/music-toggle-button";

// Preschool "Jumping Frogs" reading minigame — see docs/preschool/games/
// jumping-frogs.md for the design brief. A frog crosses a river by hopping
// across 5 rows of lily pads while a fixed target word stays shown in the
// header for the whole level; each row offers 3 word choices — rendered as
// the same syllable-card breakdown as the "Казки" game
// (lib/syllable-card.tsx), automatically split via lib/jumping-frogs-game.ts's
// splitUkrainianSyllables — and tapping the one matching the target hops the
// frog onto it. Reaching the far bank celebrates and starts a new word.
//
// The play area is modeled as 7 fixed vertical "slots": 0 = the start
// bank, 1..5 = the 5 lily-pad rows, 6 = the finish bank — so "auto-hop onto
// the far bank after row 5" reuses the exact same jump/pan machinery as an
// ordinary row hop (see JumpingFrogsLevel's performJump).

const ROWS_PER_LEVEL = 5;
const SLOT_COUNT = ROWS_PER_LEVEL + 2; // start bank + 5 rows + finish bank
const VISIBLE_SLOTS = 4;
const MAX_BASE_SLOT = SLOT_COUNT - VISIBLE_SLOTS;
const COLUMN_PERCENTS: [number, number, number] = [18, 50, 82]; // left offsets for the 3 lily pads/options
const FROG_HOME_X = 50; // centered on a bank, where there's no lily column
// Long enough for CelebrationOverlay's last firework (staggered up to
// ~(FIREWORK_COUNT-1)*0.35 + 0.15s in, itself 0.9s long) and a good chunk
// of final.mp4 (8s long, muted-autoplay, no loop — it just gets cut off
// once this window closes) to play before the overlay unmounts.
const CELEBRATION_MS = 4200;
const JUMP_ANIMATION_MS = 550;

// Which base slot the pond column should scroll to for a given camera
// position — clamped so the column never scrolls past showing its last
// VISIBLE_SLOTS. Reproduces every "which rows are visible" case the brief
// describes: cameraSlot=0 -> bank+row1-3; cameraSlot=2or3 -> 4 full lily
// rows; cameraSlot=5or6 -> row3-5+finish bank.
function baseSlotFor(cameraSlot: number): number {
  return Math.min(MAX_BASE_SLOT, Math.max(0, cameraSlot - 1));
}

function pickRandomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function wordSegments(word: string) {
  return splitUkrainianSyllables(word).map((text) => ({ kind: "text" as const, text }));
}

// Levels 1/2 (letters/syllables) always break a card down into exactly one
// segment (a bare letter or a single consonant+vowel pair — see
// splitUkrainianSyllables), unlike level 3's multi-segment word breakdown —
// so their card can be shown much bigger, sized relative to however much
// vertical room the pond actually has (`rowHeight`, itself already
// responsive to the viewport, see usePondSize) rather than a fixed rem
// value, and rendered `bare` (WordCardRow's own bordered "sheet" would
// otherwise be a second border concentric with the card's own — only
// meaningful for grouping *several* cards into one word).
const BIG_CARD_MIN_REM = 5.5;
const BIG_CARD_MAX_REM = 11;

function bigCardSizeRem(rowHeightPx: number): number {
  const rem = (rowHeightPx * 0.6) / 16;
  return Math.min(BIG_CARD_MAX_REM, Math.max(BIG_CARD_MIN_REM, rem));
}

interface PondSize {
  width: number;
  height: number;
}

const EMPTY_POND_SIZE: PondSize = { width: 0, height: 0 };

// Measures the pond viewport's own rendered size live (ResizeObserver),
// same pattern as math-game.tsx's useElementWidth — used to derive one
// row's pixel height (from however much vertical space is actually
// available, rather than a hardcoded px value) and the frog's jump
// distance in real pixels (see FrogSprite: a diagonal hop needs its
// horizontal component in px too, since `transform: translate(%)` resolves
// against the *element's own* box, not the pond's).
function usePondSize(): [(el: HTMLDivElement | null) => void, PondSize] {
  const [size, setSize] = useState<PondSize>(EMPTY_POND_SIZE);
  const observerRef = useRef<ResizeObserver | null>(null);

  const setRef = (el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    observerRef.current = observer;
  };

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return [setRef, size];
}

// The frog's resting spot (`left`/`bottom`, both fixed — no CSS transition)
// only updates once a jump *lands* (JumpingFrogsLevel commits frogColumn/
// frogSlot from onJumpEnd, not from the tap itself); the hop itself is one
// `@keyframes` animation on `transform: translate(...)`, diagonal by
// construction since it carries both the horizontal move (`--dx`, in real
// pond pixels — a caller-measured value, since `translate()`'s own `%`
// unit resolves against the *element's own* box, not the pond) and the
// vertical rise (`--row-height`) together, the same `--dx`/`--dy`-in-px
// idiom cards-game.tsx's particle-burst already uses. PondColumn keys this
// component by `jumpToken` (a fresh mount every jump, not just a style
// update on the persisting element) — setting a new custom property
// (`--dx`) *and* starting the animation in the same update on an
// already-mounted element let the browser begin animating before it had
// registered the new `--dx`, so only the jump-invariant vars
// (`--row-height`/`--hop-height`) took effect and the frog only visibly
// rose, with the horizontal move applying instantly once the *next*
// render's `left` landed — exactly the "moves in Y, then teleports to X"
// bug this fixes. A fresh element's first style computation always
// includes every property, sidestepping that race entirely. Because the
// resting position doesn't move until the animation's own onAnimationEnd
// fires, the translate's end state (`--dx`, `-rowHeight`) lines up exactly
// with the new resting spot with no visual pop between "animating" and
// "landed".
function FrogSprite({
  frogSlot,
  rowHeight,
  restX,
  jumping,
  jumpDx,
  onJumpEnd,
}: {
  frogSlot: number;
  rowHeight: number;
  restX: number;
  jumping: boolean;
  // Horizontal distance (px, real pond pixels) this jump covers.
  jumpDx: number;
  onJumpEnd: () => void;
}) {
  const size = Math.min(72, Math.max(36, rowHeight * 0.6));
  // Centered within its slot's own box via plain arithmetic on `left`/
  // `bottom` (not a static `transform: translate(-50%,-50%)`, the way a
  // lily pad centers itself) — a *static* transform would get silently
  // replaced, not composed with, the jump's own animated `transform`
  // below for the animation's whole duration, popping the frog off-center
  // for every hop. Anchoring to the slot's bottom *edge* instead of its
  // center (the very first version of this) made the frog read as still
  // standing in the last lily row rather than clearly up on the finish
  // bank once landed there.
  const style: CSSProperties = {
    bottom: (frogSlot + 0.5) * rowHeight - size / 2,
    left: `calc(${restX}% - ${size / 2}px)`,
    width: size,
    height: size,
    ...(jumping
      ? ({
          animation: `frog-jump ${JUMP_ANIMATION_MS}ms ease-out forwards`,
          "--dx": `${jumpDx}px`,
          "--hop-height": `${rowHeight * 0.55}px`,
          "--row-height": `${rowHeight}px`,
        } as CSSProperties)
      : {}),
  };

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/static/jumping-frogs/frog.png"
      alt=""
      draggable={false}
      className="pointer-events-none absolute z-10 drop-shadow"
      style={style}
      onAnimationEnd={jumping ? onJumpEnd : undefined}
    />
  );
}

function LilyPad({
  card,
  column,
  active,
  bonking,
  difficulty,
  rowHeight,
  onTap,
  onBonkEnd,
}: {
  card: ReadingGameCard;
  column: 0 | 1 | 2;
  active: boolean;
  bonking: boolean;
  difficulty: JumpingFrogsDifficulty;
  // Real pond pixels (see usePondSize) — what a level-1/2 card's size and
  // pad size scale from, so they grow/shrink with the actual viewport
  // instead of sitting at a fixed rem/px value.
  rowHeight: number;
  onTap: (column: 0 | 1 | 2) => void;
  onBonkEnd: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  // Only the row the frog can actually jump to next scales up on hover — a
  // visual "this one's live" cue; hovering an inactive row (already
  // passed, or not reached yet) would be misleading since tapping it is a
  // no-op anyway (see LilyPadRow's handleTap). Driven by explicit
  // onMouseEnter/Leave state + an inline `transform` (not a Tailwind
  // `hover:scale-150` utility) so the 1.5x is exact and unambiguous, and
  // composes correctly with the centering translate below every time —
  // relying on Tailwind's hover-variant class to compose with a *second*
  // static transform utility rendered the pad noticeably larger than 1.5x.
  const scale = active && hovered && !bonking ? 1.5 : 1;
  // The lily pad itself is the same size everywhere — scaled off the
  // pond's own measured size (rowHeight, itself responsive to the
  // viewport) rather than a fixed value, so it grows/shrinks with the
  // screen too. Only the *card* on top of it differs by difficulty: a
  // letter/syllable (levels 1/2) is always exactly one segment
  // (splitUkrainianSyllables), so it can be shown much bigger and `bare`
  // (no second, redundant border) than a word's multi-card breakdown
  // (level 3) needs.
  const simpleCard = difficulty < 3;
  const padHeight = Math.min(190, Math.max(120, rowHeight * 0.85));

  return (
    <button
      type="button"
      onClick={() => onTap(column)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onAnimationEnd={bonking ? onBonkEnd : undefined}
      aria-label={card.key}
      className="absolute top-1/2 flex flex-col items-center touch-manipulation"
      style={{
        left: `${COLUMN_PERCENTS[column]}%`,
        transform: bonking ? undefined : `translate(-50%, -50%) scale(${scale})`,
        transition: bonking ? undefined : "transform 200ms ease-out",
        animation: bonking ? "lily-bonk 0.4s ease-in-out" : undefined,
        cursor: active ? "pointer" : "default",
      }}
    >
      <span
        aria-hidden="true"
        className="absolute -z-10 rounded-[50%] bg-emerald-400/80 shadow-md"
        style={{ width: padHeight * 1.5, height: padHeight }}
      />
      {simpleCard ? (
        <WordCardRow
          segments={wordSegments(card.key)}
          size="sm"
          cardSizeRem={bigCardSizeRem(rowHeight)}
          preferPlainText={difficulty === 2}
          bare
        />
      ) : (
        <WordCardRow segments={wordSegments(card.key)} size="sm" />
      )}
    </button>
  );
}

// One row's 3 lily pads — owns which column (if any) is mid-"bonk" from a
// wrong tap, since that's purely local, self-contained feedback (docs/
// preschool/games/jumping-frogs.md §3: "картка плавно повертається" — no
// input lockout, the row stays immediately tappable).
function LilyPadRow({
  row,
  active,
  difficulty,
  rowHeight,
  onCorrect,
}: {
  row: JumpingFrogsRow;
  active: boolean;
  difficulty: JumpingFrogsDifficulty;
  rowHeight: number;
  onCorrect: (column: 0 | 1 | 2) => void;
}) {
  const [bonkColumn, setBonkColumn] = useState<0 | 1 | 2 | null>(null);

  const handleTap = (column: 0 | 1 | 2) => {
    if (!active) return;
    if (column === row.correctIndex) {
      onCorrect(column);
      return;
    }
    playFrogMissSound();
    setBonkColumn(column);
  };

  return (
    <>
      {row.options.map((card, index) => (
        <LilyPad
          key={index}
          card={card}
          column={index as 0 | 1 | 2}
          active={active}
          bonking={bonkColumn === index}
          difficulty={difficulty}
          rowHeight={rowHeight}
          onTap={handleTap}
          onBonkEnd={() => setBonkColumn(null)}
        />
      ))}
    </>
  );
}

function BankRow() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-x-0 top-0 flex h-full items-center justify-center bg-gradient-to-b from-lime-300/70 to-lime-400/70 text-3xl"
    >
      🌾🌿🌾
    </span>
  );
}

// The clipping viewport + the tall, absolutely-positioned 7-slot column
// (start bank, 5 lily rows, finish bank) that pans via a plain CSS
// `transform: translateY(...)` transition driven from JumpingFrogsLevel's
// `cameraSlot` state — see baseSlotFor's header comment for the transform
// math and `docs/preschool/games/jumping-frogs.md` §2 for the 3 "which
// rows are visible" cases it reproduces.
function PondColumn({
  content,
  difficulty,
  frogSlot,
  frogColumn,
  pendingColumn,
  jumping,
  jumpToken,
  cameraSlot,
  activeRowIndex,
  onTapRow,
  onJumpEnd,
  onPanEnd,
}: {
  content: JumpingFrogsLevelContent;
  difficulty: JumpingFrogsDifficulty;
  frogSlot: number;
  frogColumn: 0 | 1 | 2 | null;
  pendingColumn: 0 | 1 | 2 | null;
  jumping: boolean;
  // Bumped on every jump — used to `key` FrogSprite below so each jump
  // gets a fresh mount (see FrogSprite's header comment for why).
  jumpToken: number;
  cameraSlot: number;
  // Which row array index currently accepts taps — -1 while the frog is
  // mid-jump/pan, so a stray tap on the row it just left (or is about to
  // land on) can't sneak in a bonk/jump before the animation settles.
  activeRowIndex: number;
  onTapRow: (rowIndex: number, column: 0 | 1 | 2) => void;
  onJumpEnd: () => void;
  onPanEnd: (event: TransitionEvent<HTMLDivElement>) => void;
}) {
  const [setPondRef, pondSize] = usePondSize();
  const rowHeight = pondSize.height > 0 ? pondSize.height / VISIBLE_SLOTS : 0;
  const baseSlot = baseSlotFor(cameraSlot);
  const columnX = (column: 0 | 1 | 2 | null) => (column === null ? FROG_HOME_X : COLUMN_PERCENTS[column]);
  const restX = columnX(frogColumn);
  // Real pond pixels, not percent — see FrogSprite's/frog-jump's comments
  // for why `transform: translate()` needs this pre-converted from percent.
  const jumpDx = jumping ? ((columnX(pendingColumn) - restX) / 100) * pondSize.width : 0;

  return (
    <div ref={setPondRef} className="relative flex-1 overflow-hidden bg-gradient-to-b from-sky-200 to-sky-300">
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: SLOT_COUNT * rowHeight,
          // The column is bottom-anchored to the viewport (`bottom: 0`
          // above) with slot k sitting at local `bottom: k * rowHeight`, so
          // higher slots start out ABOVE the viewport's visible window —
          // revealing them means sliding the column DOWN (positive
          // translateY), not up, as baseSlot grows.
          transform: `translateY(${baseSlot * rowHeight}px)`,
          transition: "transform 700ms ease-in-out",
        }}
        onTransitionEnd={onPanEnd}
      >
        <div className="absolute inset-x-0" style={{ bottom: 0, height: rowHeight }}>
          <BankRow />
        </div>
        {content.rows.map((row, rowIndex) => (
          <div key={rowIndex} className="absolute inset-x-0" style={{ bottom: (rowIndex + 1) * rowHeight, height: rowHeight }}>
            <LilyPadRow
              row={row}
              active={rowIndex === activeRowIndex}
              difficulty={difficulty}
              rowHeight={rowHeight}
              onCorrect={(column) => onTapRow(rowIndex, column)}
            />
          </div>
        ))}
        <div className="absolute inset-x-0" style={{ bottom: (ROWS_PER_LEVEL + 1) * rowHeight, height: rowHeight }}>
          <BankRow />
        </div>

        {rowHeight > 0 && (
          <FrogSprite
            key={jumpToken}
            frogSlot={frogSlot}
            rowHeight={rowHeight}
            restX={restX}
            jumping={jumping}
            jumpDx={jumpDx}
            onJumpEnd={onJumpEnd}
          />
        )}
      </div>
    </div>
  );
}

function TargetHeaderBar({
  difficulty,
  target,
  onReplay,
}: {
  difficulty: JumpingFrogsDifficulty;
  target: ReadingGameCard;
  onReplay: () => void;
}) {
  const t = useTranslations("JumpingFrogsGame");
  const [imageFailed, setImageFailed] = useState(false);
  const big = difficulty < 3;

  return (
    <div className="flex items-center justify-center gap-3 py-3">
      <div
        aria-label={t("targetLabel", { word: target.key })}
        className="flex items-center gap-3 rounded-full bg-white px-4 py-2 shadow-lg ring-2 ring-gray-200"
      >
        {/* Levels 1/2's letters/syllables are synthesized, not drawn from a
            real word with an illustration (see buildLevelContent) — no
            image box (not even the "?" placeholder) for those, since
            there's nothing to hint was supposed to be there. */}
        {target.image ? (
          imageFailed ? (
            <span
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400"
            >
              ?
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={target.image}
              alt=""
              draggable={false}
              onError={() => setImageFailed(true)}
              className="h-14 w-14 shrink-0 rounded-lg object-cover shadow"
            />
          )
        ) : null}
        {big ? (
          <WordCardRow
            segments={wordSegments(target.key)}
            size="sm"
            cardSizeRem={7}
            preferPlainText={difficulty === 2}
            bare
          />
        ) : (
          <WordCardRow segments={wordSegments(target.key)} size="sm" cardSizeRem={3.25} />
        )}
      </div>
      {/* A separate button, not inside the white pill above (it used to sit
          inside it, sharing the card's own rounded box) — its own distinct
          circle reads more clearly as a separate control than as another
          part of the card display. Always shown and always functional
          (unlike the level's automatic narration, which respects `muted`)
          — a dedicated "read it to me" affordance should work on tap
          regardless, same as every other game's own replay button (e.g.
          cards-game.tsx's CardsFallingGame, which isn't muted-gated at all
          either). */}
      <button
        type="button"
        aria-label={t("replaySoundLabel")}
        onClick={onReplay}
        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        🔊
      </button>
    </div>
  );
}

// Holds one full level's play-through state (rows/target built once, frog
// position, camera position, animation phase) — mounted with
// `key={activeConsonant:levelToken}` by JumpingFrogsGame below so starting
// a fresh level resets all of this by remounting rather than an effect
// syncing five interdependent pieces of state to a prop change, per
// https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes.
function buildLevelContent(
  difficulty: JumpingFrogsDifficulty,
  cards: ReadingGameCard[],
  consonant: string,
  consonantPool: string[],
): JumpingFrogsLevelContent | null {
  if (difficulty === 1) return buildLetterLevel(consonant, consonantPool);
  if (difficulty === 2) return buildSyllableLevel(consonant);
  return buildLevel(cards);
}

function JumpingFrogsLevel({
  difficulty,
  consonant,
  consonantPool,
  cards,
  muted,
  onLevelComplete,
}: {
  difficulty: JumpingFrogsDifficulty;
  consonant: string;
  consonantPool: string[];
  cards: ReadingGameCard[];
  muted: boolean;
  onLevelComplete: () => void;
}) {
  const [content] = useState<JumpingFrogsLevelContent | null>(() =>
    buildLevelContent(difficulty, cards, consonant, consonantPool),
  );
  // `phase !== "idle"` is the single source of truth for input-blocking —
  // every tap handler checks it first.
  const [phase, setPhase] = useState<"idle" | "jumping" | "panning">("idle");
  const [frogSlot, setFrogSlot] = useState(0);
  // The frog's *committed* resting column — only updated once a jump lands
  // (handleJumpEnd), not when it starts. `pendingColumn` is the in-flight
  // jump's destination, used only to compute the hop's distance while
  // `phase === "jumping"`; keeping them separate is what lets the resting
  // position (and PondColumn's FrogSprite `left`/`bottom`) stay put for the
  // animation's whole duration while its `transform` carries it the rest
  // of the way, instead of the base position jumping ahead of the visual.
  const [frogColumn, setFrogColumn] = useState<0 | 1 | 2 | null>(null);
  const [pendingColumn, setPendingColumn] = useState<0 | 1 | 2 | null>(null);
  const [cameraSlot, setCameraSlot] = useState(0);
  // Bumped on every performJump — keys FrogSprite (see PondColumn) so each
  // jump gets a fresh mount instead of a style update on the persisting
  // element (see FrogSprite's header comment for why that matters). This
  // also incidentally guarantees the auto-hop onto the finish bank (a
  // *second* "jumping" phase starting back-to-back with the one that just
  // landed on the last lily pad, no pan/idle phase in between) plays too,
  // rather than the browser silently keeping the already-finished
  // animation because nothing about it looked different.
  const [jumpToken, setJumpToken] = useState(0);
  const completedRef = useRef(false);

  // `muted` only silences *automatic* narration (on landing, on this
  // level's mount) — an explicit tap on the header's 🔊 button (playWordAloud)
  // should always work, same as every other game's manual replay button
  // (e.g. cards-game.tsx's CardsFallingGame, which isn't muted-gated at all).
  const playWordAloud = (card: ReadingGameCard) => {
    if (card.sound) void playCardSound(card);
    else speak(card.key, "uk", "short");
  };
  const playWord = (card: ReadingGameCard) => {
    if (muted) return;
    playWordAloud(card);
  };

  // Every card actually used in this level needs TTS unless it has a
  // recording — prefetch the voice once, then warm up the vocabulary, same
  // pattern as reading-game.tsx/cards-game.tsx. Built from `content` itself
  // (not the raw `cards` prop) so this covers all 3 difficulties uniformly
  // — levels 1/2's letters/syllables are synthesized, not drawn from
  // `cards` at all (see buildLevelContent).
  useEffect(() => {
    if (muted || !content) return;
    let cancelled = false;
    const vocabulary = Array.from(
      new Set([content.target, ...content.rows.flatMap((row) => row.options)].map((card) => card.key)),
    );
    void prefetchVoice("uk", "short").then(() => {
      if (!cancelled) warmupSpeech(vocabulary, "uk", "short");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  // Announces the target once, when this level (re-)mounts.
  useEffect(() => {
    if (content) playWord(content.target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!content) return null;

  // Starts the frog's hop toward `toColumn` (null means the center of a
  // bank, not a lily pad — used for the auto-hop onto the finish bank).
  // Neither `frogSlot` nor `frogColumn` change here — the `frog-jump`
  // keyframe animates the *visual* diagonal hop from the frog's current
  // resting spot; `pendingColumn` records where it's headed, purely so
  // PondColumn can compute the hop's horizontal distance. handleJumpEnd
  // (below) is what actually commits the move once the animation ends.
  const performJump = (toColumn: 0 | 1 | 2 | null) => {
    setPendingColumn(toColumn);
    setPhase("jumping");
    setJumpToken((token) => token + 1);
  };

  // Decides what happens once the frog has settled at `slot` — called
  // either immediately after a jump that didn't need the camera to pan, or
  // from the pond column's onTransitionEnd once a pan that *was* needed
  // finishes (see handleJumpEnd/handlePanEnd below).
  const settleAt = (slot: number) => {
    if (slot === ROWS_PER_LEVEL) {
      // Reached the last lily pad — auto-hop onto the finish bank, no tap
      // needed (docs/preschool/games/jumping-frogs.md §3: reaching the
      // opposite bank happens right after clearing the last row).
      performJump(null);
      return;
    }
    if (slot === ROWS_PER_LEVEL + 1) {
      if (!completedRef.current) {
        completedRef.current = true;
        onLevelComplete();
      }
      return;
    }
    setPhase("idle");
  };

  const handleJumpEnd = () => {
    const nextSlot = frogSlot + 1;
    const panNeeded = baseSlotFor(nextSlot) !== baseSlotFor(cameraSlot);
    setFrogColumn(pendingColumn);
    setFrogSlot(nextSlot);
    setCameraSlot(nextSlot);
    if (panNeeded) {
      setPhase("panning"); // wait for PondColumn's onTransitionEnd
    } else {
      settleAt(nextSlot);
    }
  };

  const handlePanEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== "transform") return;
    if (phase !== "panning") return;
    settleAt(frogSlot);
  };

  const handleTapRow = (rowIndex: number, column: 0 | 1 | 2) => {
    if (phase !== "idle" || rowIndex !== frogSlot) return;
    playFrogJumpSound();
    playWord(content.rows[rowIndex].options[column]);
    performJump(column);
  };

  return (
    <div className="relative flex flex-1 flex-col">
      <TargetHeaderBar difficulty={difficulty} target={content.target} onReplay={() => playWordAloud(content.target)} />
      <PondColumn
        content={content}
        difficulty={difficulty}
        frogSlot={frogSlot}
        frogColumn={frogColumn}
        pendingColumn={pendingColumn}
        jumping={phase === "jumping"}
        jumpToken={jumpToken}
        cameraSlot={cameraSlot}
        activeRowIndex={phase === "idle" ? frogSlot : -1}
        onTapRow={handleTapRow}
        onJumpEnd={handleJumpEnd}
        onPanEnd={handlePanEnd}
      />
    </div>
  );
}

interface FireworkParticle {
  dx: number;
  dy: number;
  rotate: number;
}

interface Firework {
  id: number;
  left: number; // percent
  top: number; // percent
  delay: number; // seconds — staggered so the salutes fire one after another
  color: string;
  particles: FireworkParticle[];
}

const FIREWORK_COLORS = ["#f87171", "#fbbf24", "#34d399", "#60a5fa", "#c084fc", "#f472b6"];
const FIREWORK_COUNT = 5;
const PARTICLES_PER_FIREWORK = 12;

// Several launch points across the sky, each popping at its own moment
// (docs/preschool/games/jumping-frogs.md §3's "анімація перемоги (салют
// великого розміру)") rather than one single burst — same radiating
// dx/dy/rotate trajectory math as balloon-quiz.tsx's CelebrationStars, just
// multiple emitters instead of one centered on a mascot.
function buildFireworks(): Firework[] {
  return Array.from({ length: FIREWORK_COUNT }, (_, id) => {
    const particles = Array.from({ length: PARTICLES_PER_FIREWORK }, () => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 50 + Math.random() * 60;
      return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance, rotate: Math.random() * 360 - 180 };
    });
    return {
      id,
      left: 12 + Math.random() * 76,
      top: 8 + Math.random() * 45,
      delay: id * 0.35 + Math.random() * 0.15,
      color: FIREWORK_COLORS[id % FIREWORK_COLORS.length],
      particles,
    };
  });
}

function CelebrationOverlay() {
  const t = useTranslations("JumpingFrogsGame");
  // Lazy useState initializers (not useRef) so the random layout is
  // computed exactly once, at mount, the same way JumpingFrogsLevel's
  // `useState(() => buildLevel(cards))` does — re-rolling either on every
  // render would make the confetti/fireworks visibly jitter between frames.
  const [confetti] = useState(() =>
    Array.from({ length: 16 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      emoji: pickRandomFrom(["🎉", "✨", "🌟", "🍃"]),
    })),
  );
  const [fireworks] = useState(buildFireworks);

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 overflow-hidden bg-white/80 text-center">
      {confetti.map((piece) => (
        <span
          key={piece.id}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 text-2xl"
          style={{ left: `${piece.left}%`, animation: `confetti-fall 1.4s ease-in ${piece.delay}s forwards` }}
        >
          {piece.emoji}
        </span>
      ))}
      {fireworks.map((firework) => (
        <span
          key={firework.id}
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{ left: `${firework.left}%`, top: `${firework.top}%` }}
        >
          {firework.particles.map((particle, index) => (
            <span
              key={index}
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={
                {
                  backgroundColor: firework.color,
                  animation: `celebration-star-fly 0.9s ease-out ${firework.delay}s forwards`,
                  "--dx": `${particle.dx}px`,
                  "--dy": `${particle.dy}px`,
                  "--rotate": `${particle.rotate}deg`,
                } as CSSProperties
              }
            />
          ))}
        </span>
      ))}
      {/* Muted autoplay — this fires programmatically once the level
          completes, not from the tap that triggered it, so it can't rely on
          still being "inside" that click for an unmuted autoplay to be
          allowed (same reasoning as stories-game.tsx's inline StoryVideo).
          `poster` avoids a blank/black flash before the first frame decodes. */}
      <video
        aria-hidden="true"
        src="/static/jumping-frogs/final.mp4"
        poster="/static/jumping-frogs/frog.png"
        autoPlay
        muted
        playsInline
        className="rounded-2xl shadow-xl"
        // Fluidly scaled by the actual viewport (vw/vh), not fixed
        // breakpoint steps — capped on *both* axes so it can't overflow a
        // short/narrow screen either; no explicit width/height needed,
        // a replaced element (video) with only max-width/max-height set
        // shrinks to fit within both while keeping its own aspect ratio.
        style={{
          maxWidth: "min(85vw, 48rem)",
          maxHeight: "60vh",
          animation: "score-pop 0.5s ease-out",
        }}
      />
      <p className="text-2xl font-bold text-gray-700">{t("celebrationTitle")}</p>
    </div>
  );
}

export function JumpingFrogsGame() {
  const t = useTranslations("JumpingFrogsGame");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  const letterMode = useJumpingFrogsStore((s) => s.letterMode);
  const setLetterMode = useJumpingFrogsStore((s) => s.setLetterMode);
  const consonant = useJumpingFrogsStore((s) => s.consonant);
  const setConsonant = useJumpingFrogsStore((s) => s.setConsonant);
  const difficulty = useJumpingFrogsStore((s) => s.difficulty);
  const setDifficulty = useJumpingFrogsStore((s) => s.setDifficulty);
  const muted = useJumpingFrogsStore((s) => s.muted);
  const setMuted = useJumpingFrogsStore((s) => s.setMuted);

  const rawConsonants = useReadingGameConsonants();
  const consonants = useMemo(() => sortConsonants(rawConsonants), [rawConsonants]);

  // A consonant persisted from an earlier session might no longer be
  // ready to play — fall back to the first available one, same self-heal
  // as cards-game.tsx/reading-game.tsx.
  useEffect(() => {
    if (consonants.length > 0 && !consonants.includes(consonant)) setConsonant(consonants[0]);
  }, [consonants, consonant, setConsonant]);

  // "Random letter" re-rolls which single letter governs the whole level
  // (docs/preschool/games/jumping-frogs.md §5) — rolled once here, the
  // instant `consonants` first loads while random mode is on, and again by
  // handleLevelComplete below. Adjusted directly during render (guarded by
  // `rolledFor`, same "you might not need an effect" pattern cards-game.tsx's
  // CardsFallingGame uses for its own initial target pick) rather than in a
  // useEffect, since the effect would depend on the very state it sets.
  const [randomConsonant, setRandomConsonant] = useState("");
  const [rolledFor, setRolledFor] = useState<string[] | null>(null);
  if (letterMode === "random" && !randomConsonant && consonants.length > 0 && rolledFor !== consonants) {
    setRolledFor(consonants);
    setRandomConsonant(pickRandomFrom(consonants));
  }

  const activeConsonant = letterMode === "random" ? randomConsonant || consonant : consonant;
  const { cards } = useReadingGameLevel(activeConsonant);
  // Levels 1/2 (letters/syllables) are synthesized from `activeConsonant`
  // itself, not from `cards` (see buildLevelContent) — only level 3 (words)
  // needs an actual photographed-word pool for this consonant to be ready.
  const hasContent = difficulty === 3 ? cards.length > 0 : consonants.length > 0 && Boolean(activeConsonant);

  const [levelToken, setLevelToken] = useState(0);
  const [levelsCompleted, setLevelsCompleted] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const levelBadgeRef = useRef<HTMLDivElement>(null);

  const rewardJumpingFrogs = useRewardJumpingFrogs();
  useDiamondMilestoneReward({
    mode: "count",
    count: levelsCompleted,
    threshold: 1,
    rewardMutation: rewardJumpingFrogs,
    originRef: levelBadgeRef,
    onMilestone: playCelebrationChime,
  });

  const handleLevelComplete = () => {
    setLevelsCompleted((current) => current + 1);
    setCelebrating(true);
    setTimeout(() => {
      setCelebrating(false);
      if (letterMode === "random" && consonants.length > 0) setRandomConsonant(pickRandomFrom(consonants));
      setLevelToken((token) => token + 1);
    }, CELEBRATION_MS);
  };

  // Closes the settings panel on a click/tap outside it — same pattern as
  // cards-game.tsx/reading-game.tsx.
  useEffect(() => {
    if (!settingsOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const eventTarget = e.target as Node;
      if (settingsPanelRef.current?.contains(eventTarget)) return;
      if (settingsButtonRef.current?.contains(eventTarget)) return;
      setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [settingsOpen]);

  useBackgroundMusic();

  return (
    <div className="relative flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-3xl bg-gradient-to-b from-sky-100 via-emerald-50 to-lime-100 ring-4 ring-inset ring-white/90 shadow-lg">
      <button
        ref={settingsButtonRef}
        type="button"
        aria-label={t("settingsButton")}
        onClick={() => setSettingsOpen((current) => !current)}
        className="absolute left-20 top-4 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        ⚙️
      </button>

      <MusicToggleButton className="absolute left-32 top-4 z-10" />

      {settingsOpen && (
        <div
          ref={settingsPanelRef}
          className="absolute left-20 top-16 z-10 flex w-60 flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-lg ring-2 ring-gray-200"
        >
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("difficultyLabel")}</span>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value) as JumpingFrogsDifficulty)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
            >
              <option value={1}>{t("difficultyLetters")}</option>
              <option value={2}>{t("difficultySyllables")}</option>
              <option value={3}>{t("difficultyWords")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("letterLabel")}</span>
            <select
              value={consonant}
              disabled={letterMode === "random"}
              onChange={(e) => setConsonant(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 disabled:opacity-50"
            >
              {consonants.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={letterMode === "random"}
              onChange={(e) => setLetterMode(e.target.checked ? "random" : "fixed")}
            />
            <span className="font-medium text-gray-700">{t("randomLetterLabel")}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            <span className="font-medium text-gray-700">{t("mutedLabel")}</span>
          </label>
        </div>
      )}

      <div
        ref={levelBadgeRef}
        key={levelsCompleted}
        role="status"
        aria-label={t("levelsClearedLabel", { count: levelsCompleted })}
        className="pointer-events-none absolute right-4 top-4 z-10 flex items-center gap-1 rounded-full bg-white px-3 py-2 shadow-lg ring-2 ring-amber-200"
        style={{ animation: levelsCompleted > 0 ? "score-pop 0.3s ease-out" : undefined }}
      >
        <span aria-hidden="true" className="text-lg">
          🏆
        </span>
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-500 px-2 text-sm font-extrabold text-white">
          {levelsCompleted}
        </span>
      </div>

      {hasContent ? (
        <JumpingFrogsLevel
          key={`${difficulty}:${activeConsonant}:${levelToken}`}
          difficulty={difficulty}
          consonant={activeConsonant}
          consonantPool={consonants}
          cards={cards}
          muted={muted}
          onLevelComplete={handleLevelComplete}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-gray-500">{t("noWordsMessage")}</div>
      )}

      {celebrating && <CelebrationOverlay />}
    </div>
  );
}
