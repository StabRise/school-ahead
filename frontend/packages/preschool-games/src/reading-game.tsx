"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRewardReadingGame } from "@school-ahead/api-client/browser/auth/auth";
import { prefetchVoice, speak, speakSequence, warmupSpeech } from "@school-ahead/api-client";
import {
  playCardSound,
  playSyllableSound,
  selectLevel,
  sortConsonants,
  useReadingGameConsonants,
  useReadingGameLevel,
  type ReadingGameCard,
  type ReadingGameSyllableSounds,
} from "./lib/reading-game";
import { MAX_SYLLABLE_COUNT, MIN_SYLLABLE_COUNT, useReadingGameStore } from "./stores/reading-game-store";
import { useBackgroundMusic } from "./lib/use-background-music";
import { useDiamondMilestoneReward } from "./kit/use-diamond-milestone-reward";
import { playCelebrationChime, playMatchSound, playMissSound } from "./kit/sound-effects";
import { MusicToggleButton } from "./kit/music-toggle-button";

// Preschool "syllable drag-and-drop" reading minigame — see
// docs/preschool/games/reading/README.md for the design brief and
// docs/preschool/games/reading/README.md's implementation notes for the
// content model (public/static/letters/<Consonant>/<Word>.png, no
// hardcoded vocabulary). A child drags each picture card onto the syllable
// card it starts with; clearing every card in a level awards a Diamond via
// POST /auth/me/reading-game-reward, same trust model as the balloon-pop
// minigame's milestone reward (see accounts.services.award_reading_game_diamond).

const TAP_THRESHOLD_PX = 6;

// Syllable slots (and the picture cards, which share the same scale) grow
// or shrink with how many syllables are actually on screen — 3 syllables
// leaves room to make everything big and easy to grab, 9 needs to shrink to
// still fit. Linear between MIN_SYLLABLE_COUNT and MAX_SYLLABLE_COUNT.
const MIN_SLOT_REM = 6;
const MAX_SLOT_REM = 10.5;

function slotSizeRem(syllableCount: number): number {
  const clamped = Math.min(MAX_SYLLABLE_COUNT, Math.max(MIN_SYLLABLE_COUNT, syllableCount));
  const t = (clamped - MIN_SYLLABLE_COUNT) / (MAX_SYLLABLE_COUNT - MIN_SYLLABLE_COUNT);
  return MAX_SLOT_REM - t * (MAX_SLOT_REM - MIN_SLOT_REM);
}

interface SlotRegistry {
  set: (syllable: string, el: HTMLDivElement | null) => void;
  hitTest: (x: number, y: number) => string | null;
}

// Distance from (x, y) to the nearest point of `rect` — 0 when the point is
// already inside it.
function distanceToRect(x: number, y: number, rect: DOMRect): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.hypot(dx, dy);
}

// A young child rarely releases a dragged card exactly over its slot —
// hitTest picks the *nearest* slot rather than requiring the drop point to
// land inside one, as long as it's within a forgiving margin of that slot's
// own size (so the margin scales with slotSizeRem too, staying generous at
// every syllable count).
const SNAP_TOLERANCE_RATIO = 0.6;

function useSlotRegistry(): SlotRegistry {
  const slotsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  return useMemo(
    () => ({
      set: (syllable, el) => {
        if (el) slotsRef.current.set(syllable, el);
        else slotsRef.current.delete(syllable);
      },
      hitTest: (x, y) => {
        let closest: string | null = null;
        let closestDistance = Infinity;
        let closestTolerance = 0;
        for (const [syllable, el] of slotsRef.current) {
          const rect = el.getBoundingClientRect();
          const distance = distanceToRect(x, y, rect);
          if (distance < closestDistance) {
            closestDistance = distance;
            closest = syllable;
            closestTolerance = Math.max(rect.width, rect.height) * SNAP_TOLERANCE_RATIO;
          }
        }
        return closest !== null && closestDistance <= closestTolerance ? closest : null;
      },
    }),
    [],
  );
}

function SyllableSlot({
  syllable,
  uppercase,
  placedCards,
  registerRef,
  sizeRem,
  onPlay,
}: {
  syllable: string;
  uppercase: boolean;
  placedCards: ReadingGameCard[];
  registerRef: (syllable: string, el: HTMLDivElement | null) => void;
  sizeRem: number;
  onPlay: () => void;
}) {
  return (
    <div
      ref={(el) => registerRef(syllable, el)}
      role="button"
      tabIndex={0}
      aria-label={syllable}
      onClick={onPlay}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPlay();
        }
      }}
      className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-4 border-dashed border-white/80 bg-white/40 p-2 text-center shadow-inner"
      style={{ width: `${sizeRem}rem`, minHeight: `${sizeRem}rem` }}
    >
      <span className="font-extrabold drop-shadow-sm" style={{ fontSize: `${sizeRem * 0.34}rem` }}>
        {/* Consonant blue, vowel red — docs/preschool/games/reading/README.md
            §4: "голосні букви завжди червоні, приголосні - сині" */}
        <span style={{ color: "#0369a1" }}>{uppercase ? syllable[0] : syllable[0].toLowerCase()}</span>
        <span style={{ color: "#dc2626" }}>{uppercase ? syllable[1] : syllable[1].toLowerCase()}</span>
      </span>
      {placedCards.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1">
          {placedCards.map((card) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={card.key}
              src={card.image}
              alt={card.key}
              className="rounded-md object-cover ring-2 ring-white"
              style={{ width: `${sizeRem * 0.28}rem`, height: `${sizeRem * 0.28}rem` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DraggableCard({
  card,
  showCaptions,
  uppercase,
  slots,
  sizeRem,
  onMatch,
  onMiss,
  onTap,
}: {
  card: ReadingGameCard;
  showCaptions: boolean;
  uppercase: boolean;
  slots: SlotRegistry;
  sizeRem: number;
  onMatch: (card: ReadingGameCard) => void;
  onMiss: () => void;
  onTap: (card: ReadingGameCard) => void;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    setOffset({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    setDragging(false);
    const distance = Math.hypot(e.clientX - startRef.current.x, e.clientY - startRef.current.y);
    if (distance < TAP_THRESHOLD_PX) {
      setOffset({ x: 0, y: 0 });
      onTap(card);
      return;
    }
    const matchedSyllable = slots.hitTest(e.clientX, e.clientY);
    if (matchedSyllable === card.syllable) {
      onMatch(card);
      return; // card is about to unmount from the tray — no need to snap back
    }
    setOffset({ x: 0, y: 0 });
    if (matchedSyllable) onMiss();
  };

  return (
    <button
      type="button"
      aria-label={card.key}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        setDragging(false);
        setOffset({ x: 0, y: 0 });
      }}
      className="flex cursor-grab flex-col items-center gap-1 rounded-2xl bg-white p-2 shadow-lg ring-2 ring-gray-200 active:cursor-grabbing"
      style={{
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${dragging ? 1.08 : 1})`,
        transition: dragging ? "none" : "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
        touchAction: "none",
        zIndex: dragging ? 30 : 1,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.image}
        alt=""
        className="rounded-xl object-cover"
        style={{ width: `${sizeRem}rem`, height: `${sizeRem}rem` }}
        draggable={false}
      />
      {showCaptions && (
        <span className="font-bold text-gray-700" style={{ fontSize: `${Math.max(0.875, sizeRem * 0.14)}rem` }}>
          {uppercase ? card.key.toUpperCase() : card.key.toLowerCase()}
        </span>
      )}
    </button>
  );
}

// Holds one level's play-through state (which cards are placed, whether the
// Diamond reward already fired) — mounted with `key={consonant:syllableCount}`
// by ReadingGame below so starting a new level resets this state by
// remounting fresh instead of an effect syncing it to the level, per
// https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes.
function ReadingLevel({
  consonant,
  syllables,
  cards,
  syllableSounds,
  showCaptions,
  uppercase,
  muted,
  nextConsonant,
  onConsonantChange,
}: {
  consonant: string;
  syllables: string[];
  cards: ReadingGameCard[];
  syllableSounds: ReadingGameSyllableSounds;
  showCaptions: boolean;
  uppercase: boolean;
  muted: boolean;
  nextConsonant?: string;
  onConsonantChange: (consonant: string) => void;
}) {
  const t = useTranslations("ReadingGame");
  const [placedKeys, setPlacedKeys] = useState<Set<string>>(new Set());
  const celebrationRef = useRef<HTMLDivElement>(null);
  const slots = useSlotRegistry();

  const rewardReadingGame = useRewardReadingGame();

  // Only a syllable without its own recording, plus a word without its own
  // recording, actually needs TTS — anything with a recording (syllableSounds
  // / card.sound) is spoken from that instead, see handleMatch/handleTap
  // below.
  useEffect(() => {
    if (muted || cards.length === 0) return;
    let cancelled = false;
    const vocabulary = Array.from(
      new Set([...syllables.filter((s) => !syllableSounds[s]), ...cards.filter((c) => !c.sound).map((c) => c.key)]),
    );
    void prefetchVoice("uk", "short").then(() => {
      if (!cancelled) warmupSpeech(vocabulary, "uk", "short");
    });
    return () => {
      cancelled = true;
    };
  }, [syllables, cards, syllableSounds, muted]);

  const trayCards = cards.filter((card) => !placedKeys.has(card.key));
  const levelComplete = cards.length > 0 && trayCards.length === 0;

  // Bigger slots/cards when there are few syllables on screen, smaller when
  // there are many — see slotSizeRem. Picture cards run a bit smaller than
  // their target slot so a dragged card never looks larger than where it's
  // headed.
  const slotSize = slotSizeRem(syllables.length || MIN_SYLLABLE_COUNT);
  const cardSize = slotSize * 0.8;

  // Clearing every card in the level (docs/preschool/games/reading/
  // README.md §5: "Завершення рівня") awards 1 Diamond for a signed-in
  // student — an anonymous visitor can still clear the level, they just
  // don't earn anything (see useDiamondMilestoneReward).
  useDiamondMilestoneReward({
    mode: "level",
    complete: levelComplete,
    rewardMutation: rewardReadingGame,
    originRef: celebrationRef,
    onMilestone: playCelebrationChime,
  });

  // Both the syllable and the word that follows prefer their own recording
  // (docs/preschool/games/reading/README.md §5) and only fall back to TTS
  // when the level has none for them.
  const playSyllable = (syllable: string): Promise<void> =>
    syllableSounds[syllable] ? playSyllableSound(syllableSounds, syllable) : speakSequence([syllable], "uk", undefined, "short");

  const playWord = (card: ReadingGameCard): void => {
    if (card.sound) void playCardSound(card);
    else speak(card.key, "uk", "short");
  };

  const handleMatch = (card: ReadingGameCard) => {
    setPlacedKeys((current) => new Set(current).add(card.key));
    playMatchSound();
    if (!muted) void playSyllable(card.syllable).then(() => playWord(card));
  };

  const handleTap = (card: ReadingGameCard) => {
    if (!muted) playWord(card);
  };

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-16">
        <div className="flex flex-wrap items-start justify-center gap-3 rounded-2xl bg-white/40 p-4">
          {syllables.map((syllable) => (
            <SyllableSlot
              key={syllable}
              syllable={syllable}
              uppercase={uppercase}
              placedCards={cards.filter((card) => card.syllable === syllable && placedKeys.has(card.key))}
              registerRef={slots.set}
              sizeRem={slotSize}
              onPlay={() => {
                if (!muted) void playSyllable(syllable);
              }}
            />
          ))}
        </div>

        <div className="flex flex-1 flex-wrap content-start items-start justify-center gap-4 p-2">
          {trayCards.map((card) => (
            <DraggableCard
              key={card.key}
              card={card}
              showCaptions={showCaptions}
              uppercase={uppercase}
              slots={slots}
              sizeRem={cardSize}
              onMatch={handleMatch}
              onMiss={playMissSound}
              onTap={handleTap}
            />
          ))}
        </div>
      </div>

      {levelComplete && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-white/80 p-6 text-center">
          <div ref={celebrationRef} className="text-6xl" style={{ animation: "score-pop 0.4s ease-out" }}>
            🎉
          </div>
          <p className="text-2xl font-bold text-gray-700">{t("levelCompleteTitle")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => onConsonantChange(consonant)}
              className="rounded-full bg-white px-5 py-2 text-sm font-bold text-gray-700 shadow-lg ring-2 ring-gray-200"
            >
              {t("playAgainButton")}
            </button>
            {nextConsonant && (
              <button
                type="button"
                onClick={() => onConsonantChange(nextConsonant)}
                className="rounded-full bg-sky-500 px-5 py-2 text-sm font-bold text-white shadow-lg"
              >
                {t("nextLetterButton", { letter: nextConsonant })}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function ReadingGame() {
  const t = useTranslations("ReadingGame");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [replayToken, setReplayToken] = useState(0);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  const consonant = useReadingGameStore((s) => s.consonant);
  const setConsonant = useReadingGameStore((s) => s.setConsonant);
  const syllableCount = useReadingGameStore((s) => s.syllableCount);
  const setSyllableCount = useReadingGameStore((s) => s.setSyllableCount);
  const showCaptions = useReadingGameStore((s) => s.showCaptions);
  const setShowCaptions = useReadingGameStore((s) => s.setShowCaptions);
  const uppercase = useReadingGameStore((s) => s.uppercase);
  const setUppercase = useReadingGameStore((s) => s.setUppercase);
  const muted = useReadingGameStore((s) => s.muted);
  const setMuted = useReadingGameStore((s) => s.setMuted);

  const rawConsonants = useReadingGameConsonants();
  const consonants = useMemo(() => sortConsonants(rawConsonants), [rawConsonants]);
  const { cards: levelCards, syllableSounds } = useReadingGameLevel(consonant);
  const { syllables, cards } = useMemo(() => selectLevel(levelCards, syllableCount), [levelCards, syllableCount]);

  // A consonant persisted from an earlier session might no longer exist as
  // a folder — fall back to the first available one, same self-heal as
  // balloon-pop-game.tsx's mode fallback. Setting state here (not in an
  // effect elsewhere) is fine since it only fires once the real list loads
  // and only when the persisted value doesn't match it.
  useEffect(() => {
    if (consonants.length > 0 && !consonants.includes(consonant)) setConsonant(consonants[0]);
  }, [consonants, consonant, setConsonant]);

  // Closes the settings panel on a click/tap outside it — same pattern as
  // balloon-pop-game.tsx.
  useEffect(() => {
    if (!settingsOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (settingsPanelRef.current?.contains(target)) return;
      if (settingsButtonRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [settingsOpen]);

  useBackgroundMusic();

  const nextConsonant = consonants[consonants.indexOf(consonant) + 1];

  // "Play again" replays the same consonant+syllableCount level — bump a
  // token so the ReadingLevel key changes (and its state resets) even
  // though the level identity itself didn't.
  const handleConsonantChange = (nextValue: string) => {
    if (nextValue === consonant) setReplayToken((current) => current + 1);
    else setConsonant(nextValue);
  };

  return (
    <div className="">
      <button
        ref={settingsButtonRef}
        type="button"
        aria-label={t("settingsButton")}
        onClick={() => setSettingsOpen((current) => !current)}
        className="absolute left-20 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
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
            <span className="font-medium text-gray-700">{t("consonantLabel")}</span>
            <select
              value={consonant}
              onChange={(e) => setConsonant(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
            >
              {consonants.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">
              {t("syllableCountLabel")} ({syllableCount})
            </span>
            <input
              type="range"
              min={MIN_SYLLABLE_COUNT}
              max={MAX_SYLLABLE_COUNT}
              value={syllableCount}
              onChange={(e) => setSyllableCount(Number(e.target.value))}
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showCaptions} onChange={(e) => setShowCaptions(e.target.checked)} />
            <span className="font-medium text-gray-700">{t("showCaptionsLabel")}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={uppercase} onChange={(e) => setUppercase(e.target.checked)} />
            <span className="font-medium text-gray-700">{t("uppercaseLabel")}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            <span className="font-medium text-gray-700">{t("mutedLabel")}</span>
          </label>
        </div>
      )}

      <ReadingLevel
        key={`${consonant}:${syllableCount}:${replayToken}`}
        consonant={consonant}
        syllables={syllables}
        cards={cards}
        syllableSounds={syllableSounds}
        showCaptions={showCaptions}
        uppercase={uppercase}
        muted={muted}
        nextConsonant={nextConsonant}
        onConsonantChange={handleConsonantChange}
      />
    </div>
  );
}
