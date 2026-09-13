"use client";

import { useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import {
  buildTable,
  COCKTAIL_INGREDIENTS,
  generateRecipe,
  isIngredientNeeded,
  isRecipeExactlyMet,
  remainingNeeded,
  type CocktailRecipe,
  type CocktailTablePiece,
} from "./lib/cocktail-game";
import { useBackgroundMusic } from "./lib/use-background-music";
import { playCocktailBounceSound, playCocktailFailSound, playCocktailSplashSound, playVictoryFanfare } from "./kit/sound-effects";
import { MusicToggleButton } from "./kit/music-toggle-button";
import { useCocktailGameStore, type CocktailMode } from "./stores/cocktail-game-store";

// "Magic Cocktail" preschool minigame — see docs/preschool/games/cocktail.md
// for the design brief. A recipe card names 2-3 ingredients with small
// counts; the child taps the right scattered pieces into the glass. Two
// modes (see stores/cocktail-game-store.ts): "hint" validates every tap
// immediately (a wrong one bounces back, the glass wobbles); "free" accepts
// anything until the shaker button is pressed, which either celebrates or
// sends everything flying back out for a retry.
//
// Tap-to-move rather than real drag-and-drop, same interaction model as
// every other preschool game here (cards-game.tsx's falling-card taps,
// jumping-frogs-game.tsx's lily-pad taps) — the brief itself accepts either
// ("перетягувати (або тапати)"), and this codebase has no drag-and-drop
// machinery to reuse.

function emojiFor(key: string): string {
  return COCKTAIL_INGREDIENTS.find((ingredient) => ingredient.key === key)?.emoji ?? "❓";
}

function colorFor(key: string): string {
  return COCKTAIL_INGREDIENTS.find((ingredient) => ingredient.key === key)?.color ?? "#bae6fd";
}

// Blends every distinct ingredient currently in the glass into one liquid
// tint — plain average of each color's RGB channels, which is plenty for
// "the drink's color visibly changes as things go in" without needing a
// real subtractive-mixing model a preschooler would never notice the lack of.
function mixLiquidColor(keys: string[]): string {
  const distinctColors = [...new Set(keys)].map(colorFor);
  if (distinctColors.length === 0) return "#e0f2fe";
  const totals = distinctColors.reduce(
    (sum, hex) => {
      const r = Number.parseInt(hex.slice(1, 3), 16);
      const g = Number.parseInt(hex.slice(3, 5), 16);
      const b = Number.parseInt(hex.slice(5, 7), 16);
      return [sum[0] + r, sum[1] + g, sum[2] + b] as [number, number, number];
    },
    [0, 0, 0] as [number, number, number],
  );
  const n = distinctColors.length;
  const toHex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${toHex(totals[0])}${toHex(totals[1])}${toHex(totals[2])}`;
}

// Scatters table pieces around the glass rather than over it — rerolls a
// candidate point outside a centered exclusion box instead of clamping, so
// the distribution near the edges doesn't bunch up the way clamping would.
function randomTablePosition(): { left: number; top: number } {
  for (let attempt = 0; attempt < 12; attempt++) {
    const left = 6 + Math.random() * 88;
    const top = 8 + Math.random() * 78;
    const inCenterBox = left > 32 && left < 68 && top > 18 && top < 82;
    if (!inCenterBox) return { left, top };
  }
  return { left: 10, top: 10 };
}

function CocktailRecipeCard({ recipe, dropped }: { recipe: CocktailRecipe; dropped: string[] }) {
  const t = useTranslations("CocktailGame");
  return (
    <div className="z-10 flex flex-wrap items-center justify-center gap-3 rounded-3xl bg-white/90 px-5 py-3 shadow-lg ring-4 ring-white">
      <span className="text-sm font-bold text-gray-500 sm:text-base">{t("recipeLabel")}</span>
      {recipe.map((item) => {
        const remaining = remainingNeeded(recipe, dropped, item.key);
        const done = remaining === 0;
        return (
          <span
            key={item.key}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-lg font-extrabold transition sm:text-2xl ${
              done ? "bg-emerald-100 text-emerald-400 line-through decoration-4" : "bg-amber-50 text-amber-700"
            }`}
          >
            <span aria-hidden="true">{emojiFor(item.key)}</span>×{item.count}
          </span>
        );
      })}
    </div>
  );
}

function CocktailGlass({
  recipeTotal,
  glassKeys,
  wobbleToken,
  shaking,
  won,
}: {
  recipeTotal: number;
  glassKeys: string[];
  wobbleToken: number;
  shaking: boolean;
  won: boolean;
}) {
  const fillPct = recipeTotal > 0 ? Math.min(1, glassKeys.length / recipeTotal) : 0;
  return (
    <div
      // key={wobbleToken} would remount (losing the liquid transition), so
      // the wobble instead retriggers by swapping the animation string —
      // React only restarts a CSS `animation` when its value actually
      // changes, hence the token baked into the name via a data attribute
      // isn't enough; re-adding the exact same string wouldn't restart it,
      // so a per-token no-op timing tweak keeps every retrigger distinct.
      style={{ animation: wobbleToken > 0 ? `raccoon-shake 0.4s ease-in-out` : undefined }}
      data-wobble={wobbleToken}
      className="relative z-10 flex h-56 w-40 flex-col items-center sm:h-72 sm:w-52"
    >
      {won && (
        <span aria-hidden="true" className="absolute -top-7 text-4xl sm:-top-9 sm:text-5xl" style={{ animation: "star-pop 0.5s ease-out" }}>
          🎊
        </span>
      )}
      <svg viewBox="0 0 100 130" className="h-full w-full drop-shadow-lg" aria-hidden="true">
        <path
          d="M18 8 H82 L72 118 Q72 126 62 126 H38 Q28 126 28 118 Z"
          fill="rgba(255,255,255,0.35)"
          stroke="#94a3b8"
          strokeWidth="3"
        />
        <clipPath id="cocktail-glass-clip">
          <path d="M20 10 H80 L70.5 116 Q70.5 122 61 122 H39 Q29.5 122 29.5 116 Z" />
        </clipPath>
        <g clipPath="url(#cocktail-glass-clip)">
          <rect
            x="18"
            y={126 - fillPct * 112}
            width="64"
            height={fillPct * 112 + 10}
            fill={mixLiquidColor(glassKeys)}
            className="transition-all duration-500 ease-out"
          />
        </g>
        {shaking && (
          <text x="50" y="70" textAnchor="middle" fontSize="30" style={{ animation: "raccoon-bounce 0.3s ease-in-out infinite" }}>
            🌀
          </text>
        )}
        {won && (
          <text x="18" y="20" fontSize="20" style={{ animation: "firefly-twinkle 1s ease-in-out infinite" }}>
            ✨
          </text>
        )}
        {won && (
          <text x="70" y="40" fontSize="16" style={{ animation: "firefly-twinkle 1.3s ease-in-out infinite 0.2s" }}>
            ✨
          </text>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-6 flex flex-wrap items-start justify-center gap-0.5 px-6 sm:top-8">
        {glassKeys.slice(-10).map((key, i) => (
          <span key={i} aria-hidden="true" className="text-lg sm:text-xl" style={{ animation: "star-pop 0.4s ease-out" }}>
            {emojiFor(key)}
          </span>
        ))}
      </div>
      {won && (
        <span aria-hidden="true" className="absolute top-0 text-3xl sm:text-4xl">
          🎉
        </span>
      )}
    </div>
  );
}

const VICTORY_CONFETTI_EMOJI = ["🎉", "✨", "🍹", "🌟"];

function CocktailConfetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 1.5 + Math.random() * 1.1,
      emoji: VICTORY_CONFETTI_EMOJI[i % VICTORY_CONFETTI_EMOJI.length],
    })),
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="absolute top-0 text-2xl"
          style={{ left: `${piece.left}%`, animation: `confetti-fall ${piece.duration}s ease-in ${piece.delay}s forwards` }}
        >
          {piece.emoji}
        </span>
      ))}
    </div>
  );
}

// One full round: a fresh recipe + scattered table, played out to either a
// win or (free mode only) a wrong-recipe retry. Remounted wholesale via a
// `key` change (see CocktailGame below) on mode switch or "play again" —
// simplest way to reset every bit of round state at once, same idiom
// math-game.tsx's own doc comment credits for its runner legs.
function CocktailRound({ mode, onWin }: { mode: CocktailMode; onWin: () => void }) {
  const t = useTranslations("CocktailGame");
  const [recipe] = useState<CocktailRecipe>(generateRecipe);
  const [table] = useState<CocktailTablePiece[]>(() => buildTable(recipe));
  const [layout] = useState<Record<string, { left: number; top: number }>>(() =>
    Object.fromEntries(table.map((piece) => [piece.id, randomTablePosition()])),
  );
  const [glassIds, setGlassIds] = useState<string[]>([]);
  const [bounceId, setBounceId] = useState<string | null>(null);
  const [wobbleToken, setWobbleToken] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [showFailMessage, setShowFailMessage] = useState(false);
  const [won, setWon] = useState(false);

  const glassKeys = glassIds.map((id) => table.find((piece) => piece.id === id)!.key);
  const tablePieces = table.filter((piece) => !glassIds.includes(piece.id));
  const recipeTotal = recipe.reduce((sum, item) => sum + item.count, 0);

  // Hint mode never lets a wrong piece in, so filling every needed slot IS
  // the recipe being met — checked right where the drop happens (not a
  // useEffect keyed on glassIds.length) since it only ever needs to run
  // exactly once, the instant the last correct piece goes in.
  const dropPiece = (piece: CocktailTablePiece) => {
    playCocktailSplashSound();
    setGlassIds((ids) => {
      const next = [...ids, piece.id];
      if (mode === "hint" && recipeTotal > 0 && next.length === recipeTotal) {
        setWon(true);
        playVictoryFanfare();
      }
      return next;
    });
  };

  const rejectPiece = (piece: CocktailTablePiece) => {
    playCocktailBounceSound();
    setBounceId(piece.id);
    setWobbleToken((n) => n + 1);
    setTimeout(() => setBounceId((current) => (current === piece.id ? null : current)), 450);
  };

  const handleTap = (piece: CocktailTablePiece) => {
    if (won || shaking) return;
    if (mode === "free") {
      dropPiece(piece);
      return;
    }
    if (isIngredientNeeded(recipe, glassKeys, piece.key)) {
      dropPiece(piece);
    } else {
      rejectPiece(piece);
    }
  };

  const handleShake = () => {
    if (won || shaking || glassIds.length === 0) return;
    setShaking(true);
    setTimeout(() => {
      setShaking(false);
      if (isRecipeExactlyMet(recipe, glassKeys)) {
        setWon(true);
        playVictoryFanfare();
      } else {
        playCocktailFailSound();
        setWobbleToken((n) => n + 1);
        setGlassIds([]);
        setShowFailMessage(true);
        setTimeout(() => setShowFailMessage(false), 1800);
      }
    }, 900);
  };

  return (
    <div className="relative flex w-full flex-1 flex-col items-center gap-4 py-2">
      <CocktailRecipeCard recipe={recipe} dropped={glassKeys} />

      <div className="relative w-full flex-1">
        {tablePieces.map((piece) => (
          <button
            key={piece.id}
            type="button"
            aria-label={emojiFor(piece.key)}
            onClick={() => handleTap(piece)}
            style={
              {
                left: `${layout[piece.id].left}%`,
                top: `${layout[piece.id].top}%`,
                animation: bounceId === piece.id ? "raccoon-shake 0.4s ease-in-out" : undefined,
              } as CSSProperties
            }
            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer text-4xl transition hover:scale-125 disabled:cursor-default sm:text-5xl"
            disabled={won || shaking}
          >
            {emojiFor(piece.key)}
          </button>
        ))}

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <CocktailGlass recipeTotal={recipeTotal} glassKeys={glassKeys} wobbleToken={wobbleToken} shaking={shaking} won={won} />
        </div>
      </div>

      {mode === "free" && !won && (
        <button
          type="button"
          onClick={handleShake}
          disabled={shaking || glassIds.length === 0}
          className="preschool-button z-10 rounded-full bg-emerald-500 px-8 py-3 text-lg font-extrabold text-white shadow-lg ring-4 ring-emerald-300 transition hover:scale-105 disabled:cursor-default disabled:opacity-50 disabled:hover:scale-100"
        >
          {t("shakeButton")}
        </button>
      )}

      {showFailMessage && (
        <div
          role="alert"
          className="absolute bottom-24 z-20 rounded-2xl bg-white px-6 py-3 text-center text-lg font-bold text-rose-600 shadow-lg ring-4 ring-rose-200"
          style={{ animation: "sad-face-pop 0.4s ease-out" }}
        >
          {t("wrongRecipeMessage")}
        </div>
      )}

      {won && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 overflow-hidden bg-white/80 text-center">
          <CocktailConfetti />
          <p className="z-10 text-2xl font-extrabold text-emerald-700 sm:text-3xl">{t("celebrationTitle")}</p>
          <button
            type="button"
            onClick={onWin}
            className="preschool-button z-10 rounded-full bg-emerald-500 px-8 py-3 text-lg font-extrabold text-white shadow-lg ring-4 ring-emerald-300 transition hover:scale-105"
          >
            {t("playAgainButton")}
          </button>
        </div>
      )}
    </div>
  );
}

export function CocktailGame() {
  const t = useTranslations("CocktailGame");
  const mode = useCocktailGameStore((s) => s.mode);
  const setMode = useCocktailGameStore((s) => s.setMode);
  const [roundToken, setRoundToken] = useState(0);
  useBackgroundMusic();

  return (
    <div className="relative flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-3xl bg-gradient-to-b from-sky-100 via-emerald-50 to-lime-100 p-2 ring-4 ring-inset ring-white/90 shadow-lg sm:p-4">
      <div className="absolute left-20 top-4 z-10 flex gap-1 rounded-full bg-white p-1 shadow-lg ring-2 ring-gray-200">
        <button
          type="button"
          aria-pressed={mode === "hint"}
          onClick={() => setMode("hint")}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition sm:text-sm ${
            mode === "hint" ? "bg-emerald-500 text-white" : "text-gray-500"
          }`}
        >
          {t("hintModeLabel")}
        </button>
        <button
          type="button"
          aria-pressed={mode === "free"}
          onClick={() => setMode("free")}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition sm:text-sm ${
            mode === "free" ? "bg-emerald-500 text-white" : "text-gray-500"
          }`}
        >
          {t("freeModeLabel")}
        </button>
      </div>

      <MusicToggleButton className="absolute right-4 top-4 z-10" />

      <CocktailRound key={`${mode}-${roundToken}`} mode={mode} onWin={() => setRoundToken((n) => n + 1)} />
    </div>
  );
}
