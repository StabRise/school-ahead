"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { useRewardCocktailGame } from "@school-ahead/api-client/browser/auth/auth";
import { prefetchVoice, speak, speakSequence } from "@school-ahead/api-client";
import {
  buildEquationChoices,
  buildTable,
  COCKTAIL_INGREDIENTS,
  equationFor,
  generateRecipe,
  isIngredientNeeded,
  isRecipeExactlyMet,
  type CocktailRecipe,
  type CocktailRecipeItem,
  type CocktailTablePiece,
} from "./lib/cocktail-game";
import { describeRecipeForSpeech } from "./lib/cocktail-speech-pl";
import { useBackgroundMusic } from "./lib/use-background-music";
import { playCocktailBounceSound, playCocktailFailSound, playCocktailSplashSound, playVictoryFanfare } from "./kit/sound-effects";
import { MusicToggleButton } from "./kit/music-toggle-button";
import { useDiamondMilestoneReward } from "./kit/use-diamond-milestone-reward";
import {
  NUMBER_TILE_CLASS,
  NumberTileButton,
  equationFontSizeStyle,
  equationOperatorFontSizeStyle,
  numberTileSizeStyle,
} from "./kit/number-tile";
import { useCocktailGameStore, type CocktailMode } from "./stores/cocktail-game-store";

// This game is narrated and labeled entirely in Polish (a specific request,
// independent of the rest of the app's Ukrainian UI — see CocktailGame's
// translation keys in uk.json, which hold Polish text for this namespace
// only) — "pl" is one of piper-tts's supported SpeechLanguage voices.
const SPEECH_LANGUAGE = "pl";

// A few feedback moments reuse the same short set of interchangeable
// phrases (see the design request's own "деякі ми можемо використовувати
// рандомну фразу") rather than always saying the exact same word — picks
// one at random each time so repeated praise/retry prompts don't feel
// robotic over a long play session.
function pickPhrase(phrases: string[]): string {
  return phrases[Math.floor(Math.random() * phrases.length)];
}

const PRAISE_PHRASES = ["Brawo!", "Świetnie!"];
const REJECT_PHRASES = ["Ups! To nie ten składnik!", "Tego nie potrzebujemy.", "Spróbuj jeszcze raz."];
const WIN_PHRASES = ["Gotowe!", "Udało się!", "Nasz koktajl jest gotowy!", "Magiczny koktajl!", "Brawo! Udało się!"];

// Every speak()/speakSequence() call in this file goes through these two
// instead of calling piper-tts directly, so `muted` (stores/
// cocktail-game-store.ts, persisted client-side same as every other
// narrated game's own mute setting) only has to be checked in one place.
function sayPl(text: string, muted: boolean): void {
  if (!muted) speak(text, SPEECH_LANGUAGE);
}

function saySequencePl(texts: string[], muted: boolean): void {
  if (!muted) void speakSequence(texts, SPEECH_LANGUAGE);
}

// "Magic Cocktail" preschool minigame — see docs/preschool/games/cocktail.md
// for the design brief. A round opens with an addition-equation gate (see
// CocktailEquationGate) built from the recipe's own two ingredient counts —
// only once that's solved does the shaker/recipe/table actually mount. From
// there, a recipe card names 2 ingredients with small counts (shown as that
// many repeated icons, see IngredientCountRow, not "🍌×2" text); the child
// taps the right scattered pieces into the glass. Two modes (see
// stores/cocktail-game-store.ts): "hint" validates every tap immediately (a
// wrong one bounces back, the glass wobbles); "free" accepts anything until
// the shaker button is pressed, which either celebrates or sends everything
// flying back out for a retry.
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

// One ingredient's own count spelled out as that many repeated icons (not
// "🍌×2" text) plus a small number tile — per this feature's own request,
// so a preschooler can count the pictures directly instead of reading a
// digit-times-digit notation. `strikeCount` (0 in the equation gate, where
// nothing's collected yet) crosses out that many icons left-to-right,
// independent of *which* physical table piece they came from — the recipe
// card only ever cares how many of this key have gone in, not which ones.
function IngredientCountRow({ item, strikeCount }: { item: CocktailRecipeItem; strikeCount: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: item.count }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`text-2xl transition sm:text-3xl ${
            i < strikeCount ? "text-gray-300 line-through decoration-4 decoration-rose-400" : ""
          }`}
        >
          {emojiFor(item.key)}
        </span>
      ))}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-4 border-gray-400 bg-gray-200 text-base font-extrabold text-gray-800 shadow-inner sm:h-10 sm:w-10 sm:text-xl">
        {item.count}
      </span>
    </div>
  );
}

// Stacked one-per-line rather than the earlier wrapping row — a 2-item
// recipe wrapping onto its own line only when the row happened to run out
// of width read as arbitrary; a fixed vertical list reads the same way at
// every viewport size and every recipe.
function CocktailRecipeCard({ recipe, dropped }: { recipe: CocktailRecipe; dropped: string[] }) {
  const t = useTranslations("CocktailGame");
  return (
    <div className="z-10 flex flex-col items-center gap-2 rounded-3xl bg-white/90 px-5 py-3 shadow-lg ring-4 ring-white">
      <span className="text-sm font-bold text-gray-500 sm:text-base">{t("recipeLabel")}</span>
      {recipe.map((item) => (
        <IngredientCountRow key={item.key} item={item} strikeCount={dropped.filter((key) => key === item.key).length} />
      ))}
    </div>
  );
}

// The fruit icons drawn under an operand's digit — at most 3 per column
// (RECIPE_ITEM_COUNT_RANGE in lib/cocktail-game.ts), so they can stay large
// enough to actually count at a glance and still fit two columns plus the
// answer tile across a phone.
const EQUATION_ICON_FONT_SIZE: CSSProperties = { fontSize: "clamp(1.25rem, 6vw, 3rem)" };

// The same icons repeated under the SOLVED answer tile as counting proof —
// there are up to twice as many of them as in either operand column, and
// they have to wrap inside the tile's own width, so they're drawn smaller.
const ANSWER_PROOF_ICON_STYLE: CSSProperties = {
  fontSize: "clamp(1rem, 4vw, 2rem)",
  width: numberTileSizeStyle.width,
};

// One equation operand as a children's-workbook column: the digit on top,
// that many of its own ingredient's icon drawn underneath — per this
// feature's own request ("під числами намальовані ті фрукти"), distinct
// from IngredientCountRow's number-tile-beside-icons layout used by the
// recipe card itself.
function EquationOperandColumn({ item }: { item: CocktailRecipeItem }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="font-extrabold text-gray-800" style={equationFontSizeStyle}>
        {item.count}
      </span>
      <div className="flex gap-1" style={EQUATION_ICON_FONT_SIZE}>
        {Array.from({ length: item.count }, (_, i) => (
          <span key={i} aria-hidden="true">
            {emojiFor(item.key)}
          </span>
        ))}
      </div>
    </div>
  );
}

// How long a correctly-picked tile flashes green (see NumberTileButton's
// "correct" status) before the equation reveals its full answer — same
// duration as a wrong pick's own red flash below, for a matched beat.
const CORRECT_PICK_DELAY_MS = 500;

// How long the solved equation (filled-in answer + its combined icons)
// stays on screen before auto-advancing to the shaker/recipe/table — no
// "Далі" button to tap any more, per this feature's own request; just
// enough of a pause for the count-the-pictures payoff to land.
const NEXT_STAGE_DELAY_MS = 1500;

// The round's opening gate — "how many pieces does this recipe need in
// total," derived straight from the two recipe counts (equationFor). A
// wrong pick just flashes red and clears (see kit/number-tile.tsx's
// NumberTileButton) — there's no fail state here, only "not yet". A CORRECT
// pick flashes green first (CORRECT_PICK_DELAY_MS), then locks in that
// square, reveals the recipe's full set of icons underneath it (2 + 3
// pictures next to each other, "як в дитячих зошитах" — the same
// picture-proof workbooks use to confirm a sum), and auto-advances to the
// shaker/recipe/table after NEXT_STAGE_DELAY_MS — giving the
// count-the-pictures payoff a beat to land before the game moves on.
function CocktailEquationGate({ recipe, muted, onSolved }: { recipe: CocktailRecipe; muted: boolean; onSolved: () => void }) {
  const t = useTranslations("CocktailGame");
  const equation = equationFor(recipe);
  const [{ choices }] = useState(() => buildEquationChoices(equation.sum));
  const [wrongIndex, setWrongIndex] = useState<number | null>(null);
  // Set the instant the right tile is picked, then `solved` follows
  // CORRECT_PICK_DELAY_MS later — see the function's own doc comment.
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const combinedIcons = [
    ...Array.from({ length: recipe[0].count }, () => recipe[0].key),
    ...Array.from({ length: recipe[1].count }, () => recipe[1].key),
  ];

  // Every round's opening line — greets, then narrates the two instructions
  // the equation card and choices row already show visually. Mount-once by
  // design (a later mute toggle shouldn't replay it) — `muted` is read at
  // whatever value it has the instant this fires, same as everywhere else
  // in this file.
  useEffect(() => {
    saySequencePl(["Zróbmy razem nowy koktajl!", "Rozwiąż przykład.", "Wybierz właściwą liczbę."], muted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-advances to the shaker/recipe/table once solved — see
  // NEXT_STAGE_DELAY_MS.
  useEffect(() => {
    if (!solved) return;
    const timeout = setTimeout(onSolved, NEXT_STAGE_DELAY_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved]);

  const handlePick = (index: number, value: number) => {
    if (value === equation.sum) {
      setCorrectIndex(index);
      sayPl(pickPhrase(PRAISE_PHRASES), muted);
      setTimeout(() => setSolved(true), CORRECT_PICK_DELAY_MS);
      return;
    }
    playCocktailBounceSound();
    setWrongIndex(index);
    setTimeout(() => setWrongIndex((current) => (current === index ? null : current)), 500);
    sayPl("Spróbuj jeszcze raz.", muted);
  };

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-6 sm:gap-8">
      <div className="flex w-full flex-col items-center gap-4 rounded-3xl bg-white/90 px-2 py-5 shadow-lg ring-4 ring-white sm:gap-6 sm:px-8 sm:py-7">
        <span className="text-sm font-bold text-gray-500 sm:text-base">{t("equationLabel")}</span>
        <div className="flex items-start justify-center gap-1 sm:gap-4">
          <EquationOperandColumn item={recipe[0]} />
          <span className="font-extrabold text-gray-400" style={equationOperatorFontSizeStyle}>
            +
          </span>
          <EquationOperandColumn item={recipe[1]} />
          <span className="font-extrabold text-gray-400" style={equationOperatorFontSizeStyle}>
            =
          </span>
          {/* The answer's own square lives right here in the equation now,
              as its own column matching EquationOperandColumn's shape — an
              empty dashed placeholder until solved, then filled with the
              picked answer plus (per this feature's own request) the
              recipe's combined icon set underneath it, same "number on top,
              its pictures below" layout the operand columns already use. */}
          <div className="flex flex-col items-center gap-2">
            <span
              style={numberTileSizeStyle}
              className={`${NUMBER_TILE_CLASS} ${
                solved ? "border-emerald-400 bg-emerald-100 text-emerald-700 ring-4 ring-emerald-300" : "border-dashed border-gray-300 text-gray-300"
              }`}
            >
              {solved ? equation.sum : "?"}
            </span>
            {solved && (
              <div className="flex flex-wrap items-center justify-center gap-0.5" style={ANSWER_PROOF_ICON_STYLE}>
                {combinedIcons.map((key, i) => (
                  <span key={i} aria-hidden="true">
                    {emojiFor(key)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {!solved && (
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {choices.map((value, index) => (
            <NumberTileButton
              key={index}
              value={value}
              status={wrongIndex === index ? "incorrect" : correctIndex === index ? "correct" : "default"}
              disabled={correctIndex !== null}
              onClick={() => handlePick(index, value)}
            />
          ))}
        </div>
      )}
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

// How long the "only equations" celebration (confetti + praise) stays on
// screen before auto-advancing straight into the next equation — no button
// to tap, per this feature's own request, matching the equation gate's own
// auto-advance pacing (NEXT_STAGE_DELAY_MS) rather than the longer
// full-recipe win celebration.
const EQUATION_CELEBRATION_MS = 1800;

// Shown in place of the recipe/shaker stage when `onlyEquations` is on —
// the round already ended the moment the opening addition equation was
// solved, so this is purely a congratulatory beat before CocktailRound
// remounts fresh (see CocktailGame's roundToken) for the next przykład.
function CocktailEquationCelebration({ onDone }: { onDone: () => void }) {
  const t = useTranslations("CocktailGame");

  useEffect(() => {
    const timeout = setTimeout(onDone, EQUATION_CELEBRATION_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex w-full flex-1 flex-col items-center justify-center gap-4 overflow-hidden py-2">
      <CocktailConfetti />
      <p className="z-10 text-2xl font-extrabold text-emerald-700 sm:text-3xl" style={{ animation: "score-pop 0.4s ease-out" }}>
        {t("equationCelebrationTitle")}
      </p>
    </div>
  );
}

// One full round: a fresh recipe + scattered table, played out to either a
// win or (free mode only) a wrong-recipe retry — or, with `onlyEquations`
// on, straight from the opening equation into a celebration and the next
// round, skipping the recipe/shaker entirely. Remounted wholesale via a
// `key` change (see CocktailGame below) on mode switch or "play again" —
// simplest way to reset every bit of round state at once, same idiom
// math-game.tsx's own doc comment credits for its runner legs.
function CocktailRound({
  mode,
  muted,
  onlyEquations,
  onWin,
}: {
  mode: CocktailMode;
  muted: boolean;
  onlyEquations: boolean;
  onWin: () => void;
}) {
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
  // Gates the shaker/recipe/table behind the addition equation below —
  // false until CocktailEquationGate's onSolved fires, once per round (a
  // fresh recipe/equation comes with every remount, same as everything
  // else here).
  const [equationSolved, setEquationSolved] = useState(false);
  const [celebratingEquation, setCelebratingEquation] = useState(false);
  const celebrationRef = useRef<HTMLParagraphElement>(null);
  const rewardCocktailGame = useRewardCocktailGame();

  // Mixing a cocktail awards 1 Diamond for a signed-in student — "level"
  // mode (see useDiamondMilestoneReward) since CocktailRound remounts fresh
  // every round (key={`${mode}-${roundToken}`} below), so `won` only ever
  // reaches true once per mount, same as reading-game.tsx's own level
  // completion. No onMilestone chime here since `won` already triggers its
  // own playVictoryFanfare() above.
  useDiamondMilestoneReward({
    mode: "level",
    complete: won,
    rewardMutation: rewardCocktailGame,
    originRef: celebrationRef,
  });

  const glassKeys = glassIds.map((id) => table.find((piece) => piece.id === id)!.key);
  const tablePieces = table.filter((piece) => !glassIds.includes(piece.id));
  const recipeTotal = recipe.reduce((sum, item) => sum + item.count, 0);

  // Hint mode never lets a wrong piece in, so filling every needed slot IS
  // the recipe being met — checked right where the drop happens (not a
  // useEffect keyed on glassIds.length) since it only ever needs to run
  // exactly once, the instant the last correct piece goes in.
  const dropPiece = (piece: CocktailTablePiece) => {
    playCocktailSplashSound();
    // Only hint mode's drops are actually validated as correct — free mode
    // accepts anything, so praising every tap there would praise mistakes
    // too (its own feedback only comes from the shake button, below).
    if (mode === "hint") sayPl(pickPhrase(PRAISE_PHRASES), muted);
    setGlassIds((ids) => {
      const next = [...ids, piece.id];
      if (mode === "hint" && recipeTotal > 0 && next.length === recipeTotal) {
        setWon(true);
        playVictoryFanfare();
        sayPl(pickPhrase(WIN_PHRASES), muted);
      }
      return next;
    });
  };

  const rejectPiece = (piece: CocktailTablePiece) => {
    playCocktailBounceSound();
    setBounceId(piece.id);
    setWobbleToken((n) => n + 1);
    setTimeout(() => setBounceId((current) => (current === piece.id ? null : current)), 450);
    sayPl(pickPhrase(REJECT_PHRASES), muted);
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
    sayPl("Zaczynamy mieszać!", muted);
    setTimeout(() => {
      setShaking(false);
      if (isRecipeExactlyMet(recipe, glassKeys)) {
        setWon(true);
        playVictoryFanfare();
        sayPl(pickPhrase(WIN_PHRASES), muted);
      } else {
        playCocktailFailSound();
        setWobbleToken((n) => n + 1);
        setGlassIds([]);
        setShowFailMessage(true);
        setTimeout(() => setShowFailMessage(false), 1800);
        saySequencePl(["O nie! To nie jest właściwy przepis.", "Spróbuj ponownie.", "Wstrząśnij jeszcze raz!"], muted);
      }
    }, 900);
  };

  // The round's second narration beat, once the equation's solved and the
  // recipe/table/shaker actually mount — see CocktailEquationGate's own
  // opening lines for the first. Names the actual recipe ("dodaj 2 kiwi i
  // jedną łyżkę miodu do shakera!") rather than a generic "dodaj składniki"
  // per this feature's own request.
  const handleEquationSolved = () => {
    if (onlyEquations) {
      playVictoryFanfare();
      sayPl(pickPhrase(WIN_PHRASES), muted);
      setCelebratingEquation(true);
      return;
    }
    setEquationSolved(true);
    saySequencePl(
      [
        "Oto nasz przepis!",
        "Przyjrzyj się składnikom.",
        "Znajdź właściwe składniki.",
        `Dodaj ${describeRecipeForSpeech(recipe)} do shakera!`,
      ],
      muted,
    );
  };

  if (celebratingEquation) {
    return <CocktailEquationCelebration onDone={onWin} />;
  }

  if (!equationSolved) {
    return <CocktailEquationGate recipe={recipe} muted={muted} onSolved={handleEquationSolved} />;
  }

  return (
    <div className="relative flex w-full flex-1 flex-col items-center gap-4 py-2">
      <CocktailRecipeCard recipe={recipe} dropped={glassKeys} />

      <span className="z-10 text-sm font-bold text-emerald-800/70 sm:text-base">{t("ingredientsLabel")}</span>

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
          <p ref={celebrationRef} className="z-10 text-2xl font-extrabold text-emerald-700 sm:text-3xl">
            {t("celebrationTitle")}
          </p>
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
  const muted = useCocktailGameStore((s) => s.muted);
  const setMuted = useCocktailGameStore((s) => s.setMuted);
  const onlyEquations = useCocktailGameStore((s) => s.onlyEquations);
  const setOnlyEquations = useCocktailGameStore((s) => s.setOnlyEquations);
  const [roundToken, setRoundToken] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  useBackgroundMusic();

  // Closes the settings panel on a click/tap anywhere outside it — same
  // pattern as cars-game.tsx's own settings panel.
  useEffect(() => {
    if (!settingsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (settingsPanelRef.current?.contains(target)) return;
      if (settingsButtonRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [settingsOpen]);

  // Warms up the Polish voice model once up front so the round's opening
  // narration (CocktailEquationGate) doesn't stall on a multi-megabyte
  // download the first time this game is ever played.
  useEffect(() => {
    void prefetchVoice(SPEECH_LANGUAGE, "sentence");
  }, []);

  return (
    <div className="relative flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-3xl bg-gradient-to-b from-sky-100 via-emerald-50 to-lime-100 p-2 ring-4 ring-inset ring-white/90 shadow-lg sm:p-4">
      <button
        ref={settingsButtonRef}
        type="button"
        aria-label={t("settingsButton")}
        onClick={() => setSettingsOpen((current) => !current)}
        className="absolute left-4 top-4 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        ⚙️
      </button>

      {settingsOpen && (
        <div
          ref={settingsPanelRef}
          className="absolute left-4 top-16 z-10 flex w-60 flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-lg ring-2 ring-gray-200"
        >
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={onlyEquations} onChange={(e) => setOnlyEquations(e.target.checked)} />
            <span className="font-medium text-gray-700">{t("onlyEquationsLabel")}</span>
          </label>
        </div>
      )}

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

      {/* Narration mute — same small-icon-corner-toggle pattern as
          MusicToggleButton (h-9 w-9, white circle, ring-2), but its own
          per-game persisted setting rather than that shared cross-game
          store, matching every other narrated game's own muted/setMuted
          (see stores/cocktail-game-store.ts) since this game's Polish
          speech is independent of background music. */}
      <button
        type="button"
        aria-label={muted ? t("narrationOffLabel") : t("narrationOnLabel")}
        onClick={() => setMuted(!muted)}
        className="absolute right-14 top-4 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        {muted ? "🔇" : "🗣️"}
      </button>

      <MusicToggleButton className="absolute right-4 top-4 z-10" />

      <CocktailRound
        key={`${mode}-${roundToken}`}
        mode={mode}
        muted={muted}
        onlyEquations={onlyEquations}
        onWin={() => setRoundToken((n) => n + 1)}
      />
    </div>
  );
}
