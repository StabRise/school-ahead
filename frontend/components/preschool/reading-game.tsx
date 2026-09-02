"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, useRewardReadingGame } from "@/lib/api/browser/auth/auth";
import { mapApiUserToAuthUser } from "@/lib/api/map-user";
import { prefetchVoice, speakSequence, warmupSpeech, speak } from "@/lib/piper-tts";
import {
  selectLevel,
  sortConsonants,
  useReadingGameCards,
  useReadingGameConsonants,
  type ReadingGameCard,
} from "@/lib/reading-game";
import { useAuthStore } from "@/stores/auth-store";
import { MAX_SYLLABLE_COUNT, MIN_SYLLABLE_COUNT, useReadingGameStore } from "@/stores/reading-game-store";
import { useDiamondRewardStore } from "@/stores/diamond-reward-store";

// Preschool "syllable drag-and-drop" reading minigame — see
// docs/preschool/games/reading/README.md for the design brief and
// docs/preschool/games/reading/README.md's implementation notes for the
// content model (public/static/reading-game/<Consonant>/<Word>.png, no
// hardcoded vocabulary). A child drags each picture card onto the syllable
// card it starts with; clearing every card in a level awards a Diamond via
// POST /auth/me/reading-game-reward, same trust model as the balloon-pop
// minigame's milestone reward (see accounts.services.award_reading_game_diamond).

const TAP_THRESHOLD_PX = 6;

function getAudioContextClass(): typeof AudioContext | undefined {
  return (
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

// A short, bright "match!" bell — distinct from playMissSound's soft nudge
// so success reads unmistakably as success.
function playMatchSound() {
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    const notes = [783.99, 1046.5]; // G5, C6
    notes.forEach((frequency, i) => {
      const startTime = ctx.currentTime + i * 0.1;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.35);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.37);
    });
    setTimeout(() => ctx.close(), (notes.length * 0.1 + 0.37) * 1000);
  } catch {
    // Best-effort only — never block the game on audio failures.
  }
}

// A soft, low "not quite" nudge for a card dropped on the wrong syllable —
// deliberately gentle (docs/preschool/games/reading/README.md §5: "легким
// звуком-підказкою"), not a harsh buzzer.
function playMissSound() {
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(220, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.22);
    oscillator.onended = () => ctx.close();
  } catch {
    // Best-effort only.
  }
}

// Bigger celebratory arpeggio for clearing a whole level — same shape as
// components/preschool/balloon-pop-game.tsx's playDiamondChime.
function playLevelCompleteChime() {
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((frequency, i) => {
      const startTime = ctx.currentTime + i * 0.09;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.4);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.42);
    });
    setTimeout(() => ctx.close(), (notes.length * 0.09 + 0.42) * 1000);
  } catch {
    // Best-effort only.
  }
}

interface SlotRegistry {
  set: (syllable: string, el: HTMLDivElement | null) => void;
  hitTest: (x: number, y: number) => string | null;
}

function useSlotRegistry(): SlotRegistry {
  const slotsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  return useMemo(
    () => ({
      set: (syllable, el) => {
        if (el) slotsRef.current.set(syllable, el);
        else slotsRef.current.delete(syllable);
      },
      hitTest: (x, y) => {
        for (const [syllable, el] of slotsRef.current) {
          const rect = el.getBoundingClientRect();
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return syllable;
        }
        return null;
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
}: {
  syllable: string;
  uppercase: boolean;
  placedCards: ReadingGameCard[];
  registerRef: (syllable: string, el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={(el) => registerRef(syllable, el)}
      className="flex min-h-[6.5rem] w-24 flex-col items-center justify-center gap-1 rounded-2xl border-4 border-dashed border-white/80 bg-white/40 p-2 text-center shadow-inner"
    >
      <span className="text-3xl font-extrabold drop-shadow-sm">
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
              className="h-8 w-8 rounded-md object-cover ring-2 ring-white"
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
  onMatch,
  onMiss,
  onTap,
}: {
  card: ReadingGameCard;
  showCaptions: boolean;
  uppercase: boolean;
  slots: SlotRegistry;
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
      <img src={card.image} alt="" className="h-16 w-16 rounded-xl object-cover sm:h-20 sm:w-20" draggable={false} />
      {showCaptions && (
        <span className="text-sm font-bold text-gray-700">{uppercase ? card.key.toUpperCase() : card.key.toLowerCase()}</span>
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
  showCaptions,
  uppercase,
  muted,
  nextConsonant,
  onConsonantChange,
}: {
  consonant: string;
  syllables: string[];
  cards: ReadingGameCard[];
  showCaptions: boolean;
  uppercase: boolean;
  muted: boolean;
  nextConsonant?: string;
  onConsonantChange: (consonant: string) => void;
}) {
  const t = useTranslations("ReadingGame");
  const [placedKeys, setPlacedKeys] = useState<Set<string>>(new Set());
  const awardedRef = useRef(false);
  const celebrationRef = useRef<HTMLDivElement>(null);
  const slots = useSlotRegistry();

  const setUser = useAuthStore((s) => s.setUser);
  const addDiamondFlight = useDiamondRewardStore((s) => s.addFlight);
  const queryClient = useQueryClient();
  const rewardReadingGame = useRewardReadingGame();

  useEffect(() => {
    if (muted || cards.length === 0) return;
    let cancelled = false;
    const vocabulary = Array.from(new Set([...syllables, ...cards.map((c) => c.key)]));
    void prefetchVoice("uk", "short").then(() => {
      if (!cancelled) warmupSpeech(vocabulary, "uk", "short");
    });
    return () => {
      cancelled = true;
    };
  }, [syllables, cards, muted]);

  const trayCards = cards.filter((card) => !placedKeys.has(card.key));
  const levelComplete = cards.length > 0 && trayCards.length === 0;

  // Clearing every card in the level (docs/preschool/games/reading/
  // README.md §5: "Завершення рівня") awards 1 Diamond — deduped via
  // awardedRef so a re-render before the mutation settles can't
  // double-award, same as balloon-pop-game.tsx's awardedMilestonesRef.
  useEffect(() => {
    if (!levelComplete || awardedRef.current) return;
    awardedRef.current = true;

    playLevelCompleteChime();
    const rect = celebrationRef.current?.getBoundingClientRect();
    const from = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    addDiamondFlight(from);

    rewardReadingGame.mutate(undefined, {
      onSuccess: (response) => {
        setUser(mapApiUserToAuthUser(response.user));
        queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
      },
    });
    // rewardReadingGame/setUser/queryClient/addDiamondFlight are stable
    // across renders; only re-run when the level itself is actually cleared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelComplete]);

  const handleMatch = (card: ReadingGameCard) => {
    setPlacedKeys((current) => new Set(current).add(card.key));
    playMatchSound();
    if (!muted) void speakSequence([card.syllable, card.key], "uk", undefined, "short");
  };

  const handleTap = (card: ReadingGameCard) => {
    if (!muted) speak(card.key, "uk", "short");
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
  const levelCards = useReadingGameCards(consonant);
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

  const nextConsonant = consonants[consonants.indexOf(consonant) + 1];

  // "Play again" replays the same consonant+syllableCount level — bump a
  // token so the ReadingLevel key changes (and its state resets) even
  // though the level identity itself didn't.
  const handleConsonantChange = (nextValue: string) => {
    if (nextValue === consonant) setReplayToken((current) => current + 1);
    else setConsonant(nextValue);
  };

  return (
    <div className="relative flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-3xl bg-gradient-to-b from-sky-100 via-emerald-50 to-lime-100 ring-4 ring-inset ring-white/90 shadow-lg">
      <button
        ref={settingsButtonRef}
        type="button"
        aria-label={t("settingsButton")}
        onClick={() => setSettingsOpen((current) => !current)}
        className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        ⚙️
      </button>

      {settingsOpen && (
        <div
          ref={settingsPanelRef}
          className="absolute left-4 top-16 z-10 flex w-60 flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-lg ring-2 ring-gray-200"
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
        showCaptions={showCaptions}
        uppercase={uppercase}
        muted={muted}
        nextConsonant={nextConsonant}
        onConsonantChange={handleConsonantChange}
      />
    </div>
  );
}
