"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRewardCardsGame } from "@school-ahead/api-client/browser/auth/auth";
import { BalloonLearningCards, type LearningCard } from "./balloon-learning-cards";
import { prefetchVoice, speakSequence, warmupSpeech } from "@school-ahead/api-client";
import { sortConsonants, useCardsGameConsonants, useCardsGameLevel, type CardsGameCard } from "./lib/cards-game";
import { useCardsGameStore } from "./stores/cards-game-store";
import { useBackgroundMusic } from "./lib/use-background-music";
import { useDiamondMilestoneReward } from "./kit/use-diamond-milestone-reward";
import { playCelebrationChime, playMatchSound, playMissSound } from "./kit/sound-effects";
import { MusicToggleButton } from "./kit/music-toggle-button";

// Preschool "Cards" reading minigame — see docs/preschool/games/reading/
// Cards.md for the design brief. Unlike the syllable drag-and-drop game
// (reading-game.tsx), every card here is a single pre-rendered image
// (public/static/letters/<Consonant>/<Syllable>.png — syllable text and its
// illustration already baked into one picture, see backend's
// slice_flashcard_grid command). Two screens, toggled bottom-right exactly
// like balloon-pop-game.tsx's screenMode pill:
//   - "Навчання" (CardsLevel): tap a card at your own pace to hear its
//     syllable then the pictured word — the flashcard-grid UI is
//     balloon-learning-cards.tsx's BalloonLearningCards, reused as-is.
//   - "Гра" / "Перевірка знань" (CardsFallingGame): a knowledge check —
//     cards fall like balloon-pop-game.tsx's FallingBalloon (same
//     animation, spawn loop, pop/miss sound and particle-burst shape) and
//     the child must tap the one matching a spoken/displayed target
//     syllable instead of any card scoring.

function toLearningCards(cards: CardsGameCard[], showCaptions: boolean): LearningCard[] {
  return cards.map((card) => ({
    key: card.syllable,
    name: showCaptions ? card.word : "",
    image: card.image,
  }));
}

// Holds one level's play-through state (which cards have been heard at
// least once) — mounted with `key={consonant:replayToken}` by CardsGame
// below so starting a new level (or replaying the same one) resets this
// state by remounting fresh instead of an effect syncing it to the level,
// per https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes.
function CardsLevel({
  consonant,
  cards,
  showCaptions,
  muted,
  nextConsonant,
  onConsonantChange,
}: {
  consonant: string;
  cards: CardsGameCard[];
  showCaptions: boolean;
  muted: boolean;
  nextConsonant?: string;
  onConsonantChange: (consonant: string) => void;
}) {
  const t = useTranslations("CardsGame");
  const [learnedKeys, setLearnedKeys] = useState<Set<string>>(new Set());
  const awardedRef = useRef(false);
  const celebrationRef = useRef<HTMLDivElement>(null);

  // Every syllable plus every non-empty pictured word needs TTS (there are
  // no recorded pronunciations under public/static/letters, unlike
  // public/static/reading-game) — prefetch the voice once, then warm up the
  // whole level's vocabulary.
  useEffect(() => {
    if (muted || cards.length === 0) return;
    let cancelled = false;
    const vocabulary = Array.from(new Set(cards.flatMap((card) => [card.syllable, card.word]).filter(Boolean)));
    void prefetchVoice("uk", "short").then(() => {
      if (!cancelled) warmupSpeech(vocabulary, "uk", "short");
    });
    return () => {
      cancelled = true;
    };
  }, [cards, muted]);

  const levelComplete = cards.length > 0 && learnedKeys.size === cards.length;

  // Touching every card at least once (docs/preschool/games/reading/
  // Cards.md §5: "торкнулась усіх карток приголосної хоча б раз") celebrates
  // the level — deduped via awardedRef so a re-render can't replay the
  // chime twice, same as reading-game.tsx's awardedRef.
  useEffect(() => {
    if (!levelComplete || awardedRef.current) return;
    awardedRef.current = true;
    playCelebrationChime();
  }, [levelComplete]);

  const items = useMemo(() => toLearningCards(cards, showCaptions), [cards, showCaptions]);
  const cardsByKey = useMemo(() => new Map(cards.map((card) => [card.syllable, card])), [cards]);

  const handlePlay = (item: LearningCard) => {
    const card = cardsByKey.get(item.key);
    if (!card || muted) return;
    void speakSequence([card.syllable, card.word].filter(Boolean), "uk", undefined, "short");
  };

  const handleCardLearned = (item: LearningCard) => {
    setLearnedKeys((current) => new Set(current).add(item.key));
  };

  return (
    <div className="relative flex flex-1 flex-col">
      <BalloonLearningCards items={items} muted={muted} onPlay={handlePlay} onCardLearned={handleCardLearned} />

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
    </div>
  );
}

interface FallingCard {
  id: number;
  syllable: string;
  image: string;
  left: number; // percent across the play area
  duration: number; // seconds to fall
  size: number; // px
}

interface Particle {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

// Falling-card tuning — slower fall than balloon-pop-game.tsx's balloons
// (a syllable takes longer to read than a balloon takes to just glance at
// and pop), but enough on screen at once that the target is never the only
// card waiting to be found.
const SPAWN_INTERVAL_MS = 900;
const MAX_ON_SCREEN = 10;
const MIN_FALL_SECONDS = 8;
const MAX_FALL_SECONDS = 13;
const MIN_CARD_SIZE_PX = 92;
const MAX_CARD_SIZE_PX = 124;
const PARTICLES_PER_POP = 10;

// Every DIAMOND_MILESTONE_STARS matched cards converts into 1 Diamond,
// awarded via POST /auth/me/cards-game-reward — same "count" milestone
// shape as Balloon Pop's rubies/Trains' letters/Stories' stars (see
// useDiamondMilestoneReward and docs/core/gamification.md), unlike
// Reading's "clear a level" shape.
const DIAMOND_MILESTONE_STARS = 10;

let nextFallingCardId = 0;
let nextFallingParticleId = 0;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function FallingCardNode({
  card,
  onTap,
  onMissed,
}: {
  card: FallingCard;
  onTap: (card: FallingCard, rect: DOMRect) => void;
  onMissed: (cardId: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // Reacts on pointerdown (not just click) so a fast tap always registers
  // before the card animates away — same reasoning as balloon-pop-game.tsx's
  // BalloonNode.
  const tappedRef = useRef(false);

  const handleTap = () => {
    if (tappedRef.current) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    tappedRef.current = true;
    onTap(card, rect);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    handleTap();
  };

  return (
    <button
      ref={ref}
      type="button"
      aria-label={card.syllable}
      onPointerDown={handlePointerDown}
      onClick={handleTap}
      className="absolute top-0 cursor-pointer touch-manipulation"
      style={{
        left: `${card.left}%`,
        width: card.size,
        animation: `balloon-fall ${card.duration}s linear forwards`,
      }}
      onAnimationEnd={() => onMissed(card.id)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.image}
        alt=""
        draggable={false}
        className="w-full rounded-2xl object-cover shadow-lg ring-2 ring-white"
        style={{ pointerEvents: "none" }}
      />
    </button>
  );
}

// "Гра" / "Перевірка знань" knowledge-check screen — a random target
// syllable is announced (spoken + shown), the level's cards fall like
// balloon-pop-game.tsx's balloons, and tapping the one matching the target
// scores a point and picks the next target; tapping any other card (or
// letting one reach the bottom) is a no-op, not a penalty. Mounted with
// `key={consonant}` by CardsGame below so switching levels resets score/
// target by remounting fresh, same reasoning as CardsLevel above.
function CardsFallingGame({ cards, muted }: { cards: CardsGameCard[]; muted: boolean }) {
  const t = useTranslations("CardsGame");
  const [fallingCards, setFallingCards] = useState<FallingCard[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [target, setTarget] = useState<CardsGameCard | null>(null);
  // Mirrors which `cards` array the initial target below was last picked
  // for — compared by reference against the (memoized-by-caller) `cards`
  // prop, so a target is (re-)rolled during render exactly once per level
  // instead of via a setState-in-effect, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [initializedFor, setInitializedFor] = useState<CardsGameCard[] | null>(null);
  const [score, setScore] = useState(0);
  const [scoreBump, setScoreBump] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const scoreBadgeRef = useRef<HTMLDivElement>(null);
  const rewardCardsGame = useRewardCardsGame();

  useDiamondMilestoneReward({
    mode: "count",
    count: score,
    threshold: DIAMOND_MILESTONE_STARS,
    rewardMutation: rewardCardsGame,
    originRef: scoreBadgeRef,
    onMilestone: playCelebrationChime,
  });

  if (cards.length > 0 && initializedFor !== cards) {
    setInitializedFor(cards);
    setTarget(randomFrom(cards));
  }

  const speakTarget = (card: CardsGameCard) => {
    if (!muted) void speakSequence([card.syllable, card.word].filter(Boolean), "uk", undefined, "short");
  };

  const pickNextTarget = () => {
    if (cards.length === 0) return;
    const candidates = cards.length > 1 ? cards.filter((c) => c.syllable !== target?.syllable) : cards;
    setTarget(randomFrom(candidates.length > 0 ? candidates : cards));
  };

  // Prefetches/warms the voice the same way CardsLevel does — this screen
  // can be the first one a child opens, so it can't assume CardsLevel
  // already paid for the download.
  useEffect(() => {
    if (muted || cards.length === 0) return;
    let cancelled = false;
    const vocabulary = Array.from(new Set(cards.flatMap((card) => [card.syllable, card.word]).filter(Boolean)));
    void prefetchVoice("uk", "short").then(() => {
      if (!cancelled) warmupSpeech(vocabulary, "uk", "short");
    });
    return () => {
      cancelled = true;
    };
  }, [cards, muted]);

  // Speaks the target syllable+word whenever it changes — covers both the
  // initial target (set during render above) and every subsequent one
  // (set from the tap handler) with a single side effect, rather than
  // calling speakTarget from every place `target` can change.
  useEffect(() => {
    if (target) speakTarget(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(() => {
    if (cards.length === 0) return;
    const interval = setInterval(() => {
      setFallingCards((current) => {
        if (current.length >= MAX_ON_SCREEN) return current;
        const source = randomFrom(cards);
        const card: FallingCard = {
          id: nextFallingCardId++,
          syllable: source.syllable,
          image: source.image,
          left: randomBetween(4, 82),
          duration: randomBetween(MIN_FALL_SECONDS, MAX_FALL_SECONDS),
          size: randomBetween(MIN_CARD_SIZE_PX, MAX_CARD_SIZE_PX),
        };
        return [...current, card];
      });
    }, SPAWN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [cards]);

  const handleMissed = (cardId: number) => {
    setFallingCards((current) => current.filter((c) => c.id !== cardId));
  };

  const handleTap = (card: FallingCard, rect: DOMRect) => {
    setFallingCards((current) => current.filter((c) => c.id !== card.id));

    if (card.syllable !== target?.syllable) {
      playMissSound();
      return;
    }

    const containerRect = containerRef.current?.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - (containerRect?.left ?? 0);
    const y = rect.top + rect.height / 2 - (containerRect?.top ?? 0);
    const burst: Particle[] = Array.from({ length: PARTICLES_PER_POP }, () => {
      const angle = Math.random() * Math.PI * 2;
      const distance = randomBetween(24, 56);
      return {
        id: nextFallingParticleId++,
        x,
        y,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
      };
    });
    setParticles((current) => [...current, ...burst]);
    setTimeout(() => {
      const burstIds = new Set(burst.map((p) => p.id));
      setParticles((current) => current.filter((p) => !burstIds.has(p.id)));
    }, 650);

    playMatchSound();
    setScore((current) => current + 1);
    setScoreBump((current) => current + 1);
    pickNextTarget();
  };

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden">
      {target && (
        // pointer-events-none on this wrapper (it spans the full width via
        // inset-x-0, only its centered pill child is ever visible) so it
        // doesn't sit — invisibly, but still clickable — on top of the
        // settings button in the top-left corner, which shares this same
        // top-4 row and would otherwise never receive the tap.
        <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-white px-6 py-3 shadow-lg ring-2 ring-gray-200">
            <span aria-label={t("targetLabel", { syllable: target.syllable })} className="font-extrabold text-5xl">
              <span style={{ color: "#0369a1" }}>{target.syllable[0]}</span>
              <span style={{ color: "#dc2626" }}>{target.syllable[1]}</span>
            </span>
            <button
              type="button"
              aria-label={t("replaySoundLabel")}
              onClick={() => speakTarget(target)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-50 text-lg"
            >
              🔊
            </button>
          </div>
        </div>
      )}

      <div
        ref={scoreBadgeRef}
        key={scoreBump}
        role="status"
        aria-label={t("scoreLabel", { count: score })}
        className="pointer-events-none absolute right-4 top-4 z-10 flex items-center gap-1 rounded-full bg-white px-3 py-2 shadow-lg ring-2 ring-emerald-200"
        style={{ animation: scoreBump > 0 ? "score-pop 0.3s ease-out" : undefined }}
      >
        <span aria-hidden="true" className="text-lg">
          ⭐
        </span>
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-emerald-500 px-2 text-sm font-extrabold text-white">
          {score}
        </span>
      </div>

      {fallingCards.map((card) => (
        <FallingCardNode key={card.id} card={card} onTap={handleTap} onMissed={handleMissed} />
      ))}

      {particles.map((particle) => (
        // Outer span statically centers the burst on the tapped card
        // (translate(-50%,-50%)); the inner one carries particle-burst's own
        // translate/scale animation, so the two transforms don't clash.
        <span
          key={particle.id}
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{ left: particle.x, top: particle.y, transform: "translate(-50%, -50%)" }}
        >
          <span
            className="block text-xl"
            style={
              {
                animation: "particle-burst 0.6s ease-out forwards",
                "--dx": `${particle.dx}px`,
                "--dy": `${particle.dy}px`,
              } as React.CSSProperties
            }
          >
            ⭐
          </span>
        </span>
      ))}
    </div>
  );
}

export function CardsGame() {
  const t = useTranslations("CardsGame");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [replayToken, setReplayToken] = useState(0);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  const consonant = useCardsGameStore((s) => s.consonant);
  const setConsonant = useCardsGameStore((s) => s.setConsonant);
  const showCaptions = useCardsGameStore((s) => s.showCaptions);
  const setShowCaptions = useCardsGameStore((s) => s.setShowCaptions);
  const muted = useCardsGameStore((s) => s.muted);
  const setMuted = useCardsGameStore((s) => s.setMuted);
  const screenMode = useCardsGameStore((s) => s.screenMode);
  const setScreenMode = useCardsGameStore((s) => s.setScreenMode);

  const rawConsonants = useCardsGameConsonants();
  const consonants = useMemo(() => sortConsonants(rawConsonants), [rawConsonants]);
  const cards = useCardsGameLevel(consonant);

  // A consonant persisted from an earlier session might no longer be ready
  // to play — fall back to the first available one, same self-heal as
  // reading-game.tsx.
  useEffect(() => {
    if (consonants.length > 0 && !consonants.includes(consonant)) setConsonant(consonants[0]);
  }, [consonants, consonant, setConsonant]);

  // Closes the settings panel on a click/tap outside it — same pattern as
  // reading-game.tsx / balloon-pop-game.tsx.
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

  // "Play again" replays the same consonant level — bump a token so the
  // CardsLevel key changes (and its state resets) even though the level
  // identity itself didn't.
  const handleConsonantChange = (nextValue: string) => {
    if (nextValue === consonant) setReplayToken((current) => current + 1);
    else setConsonant(nextValue);
  };

  const hasCards = cards.length > 0;

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

      <MusicToggleButton className="absolute left-16 top-4 z-10" />

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
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showCaptions} onChange={(e) => setShowCaptions(e.target.checked)} />
            <span className="font-medium text-gray-700">{t("showCaptionsLabel")}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            <span className="font-medium text-gray-700">{t("mutedLabel")}</span>
          </label>
        </div>
      )}

      {screenMode === "game" ? (
        <CardsFallingGame key={consonant} cards={cards} muted={muted} />
      ) : (
        <CardsLevel
          key={`${consonant}:${replayToken}`}
          consonant={consonant}
          cards={cards}
          showCaptions={showCaptions}
          muted={muted}
          nextConsonant={nextConsonant}
          onConsonantChange={handleConsonantChange}
        />
      )}

      {hasCards && (
        <div className="absolute bottom-4 right-4 z-10 flex overflow-hidden rounded-full bg-white p-1 text-sm font-bold shadow-lg ring-2 ring-gray-200">
          <button
            type="button"
            onClick={() => setScreenMode("game")}
            className={`rounded-full px-3 py-1.5 transition-colors ${
              screenMode === "game" ? "bg-emerald-500 text-white" : "text-gray-600"
            }`}
          >
            {t("screenModeGame")} ({t("screenModeGameHint")})
          </button>
          <button
            type="button"
            onClick={() => setScreenMode("learning")}
            className={`rounded-full px-3 py-1.5 transition-colors ${
              screenMode === "learning" ? "bg-emerald-500 text-white" : "text-gray-600"
            }`}
          >
            {t("screenModeLearning")}
          </button>
        </div>
      )}
    </div>
  );
}
