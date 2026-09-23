"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { BalloonPopGame } from "./balloon-pop-game";
import { TrainsGame } from "./trains-game";
import { ReadingGame } from "./reading-game";
import { CardsGame } from "./cards-game";
import { StoriesGame } from "./stories-game";
import { MathGame } from "./math-game";
import { HomeButton } from "./kit/home-button";
import { GameMusic } from "./kit/game-music-config";

// Celebration screen shown once every one of today's lessons (tails
// included) is Completed, Pending Review, or Need Help — see
// components/student-dashboard.tsx's READY_FOR_GAME_STATUSES check and
// docs/views/preschool/README.md. Lets the child pick which reward minigame
// to play instead of always jumping straight into Balloon Pop; Balloons
// stays the visually recommended/default pick. Local-state-driven (not
// routed) since it's an inline overlay on the dashboard, not a page of its
// own — contrast the standalone /games entry point (games-page.tsx,
// game-play-page.tsx), which reuses this file's GamePicker/GameCard but
// navigates to /games/{game} instead so each game has its own URL.
export type PreschoolGameId =
  | "balloons"
  | "trains"
  | "reading"
  | "cards"
  | "stories"
  | "math"
  | "jumping-frogs"
  | "cocktail"
  | "cars"
  | "flashcards";

function BalloonIcon() {
  return (
    <svg
      viewBox="0 0 40 52"
      className="h-12 w-12 drop-shadow sm:h-14 sm:w-14"
      aria-hidden="true"
    >
      <ellipse cx="20" cy="20" rx="18" ry="20" fill="#fb7185" />
      <ellipse cx="14" cy="12" rx="4" ry="6" fill="white" opacity="0.35" />
      <path d="M20 40 L17 46 L23 46 Z" fill="#fb7185" />
      <line x1="20" y1="46" x2="20" y2="52" stroke="#94a3b8" strokeWidth="1" />
    </svg>
  );
}

function TrainIcon() {
  return (
    <svg
      viewBox="0 0 100 60"
      className="h-12 w-12 drop-shadow sm:h-14 sm:w-14"
      aria-hidden="true"
    >
      <circle cx="18" cy="50" r="7" fill="#334155" />
      <circle cx="38" cy="50" r="7" fill="#334155" />
      <circle cx="70" cy="50" r="7" fill="#334155" />
      <circle cx="90" cy="50" r="7" fill="#334155" />
      <rect x="6" y="18" width="42" height="28" rx="6" fill="#38bdf8" />
      <rect x="12" y="4" width="14" height="14" rx="2" fill="#38bdf8" />
      <rect x="52" y="14" width="42" height="32" rx="6" fill="#fbbf24" />
    </svg>
  );
}

function ReadingIcon() {
  return (
    <svg
      viewBox="0 0 64 52"
      className="h-12 w-12 drop-shadow sm:h-14 sm:w-14"
      aria-hidden="true"
    >
      <rect x="4" y="6" width="24" height="40" rx="4" fill="#fbbf24" />
      <rect x="36" y="6" width="24" height="40" rx="4" fill="#38bdf8" />
      <path d="M28 6 Q32 12 36 6 V46 Q32 40 28 46 Z" fill="#f1f5f9" />
      <text
        x="16"
        y="30"
        textAnchor="middle"
        fontSize="16"
        fontWeight="bold"
        fill="#0369a1"
      >
        М
      </text>
      <text
        x="48"
        y="30"
        textAnchor="middle"
        fontSize="16"
        fontWeight="bold"
        fill="#dc2626"
      >
        А
      </text>
    </svg>
  );
}

function CardsIcon() {
  return (
    <svg
      viewBox="0 0 64 52"
      className="h-12 w-12 drop-shadow sm:h-14 sm:w-14"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="8"
        width="24"
        height="36"
        rx="4"
        fill="#f1f5f9"
        stroke="#cbd5e1"
        strokeWidth="2"
      />
      <rect
        x="26"
        y="4"
        width="24"
        height="36"
        rx="4"
        fill="white"
        stroke="#cbd5e1"
        strokeWidth="2"
      />
      <text
        x="38"
        y="24"
        textAnchor="middle"
        fontSize="14"
        fontWeight="bold"
        fill="#0369a1"
      >
        М
      </text>
      <text
        x="47"
        y="24"
        textAnchor="middle"
        fontSize="14"
        fontWeight="bold"
        fill="#dc2626"
      >
        А
      </text>
      <circle cx="38" cy="32" r="5" fill="#fbbf24" />
    </svg>
  );
}

function StoriesIcon() {
  return (
    <svg
      viewBox="0 0 56 52"
      className="h-12 w-12 drop-shadow sm:h-14 sm:w-14"
      aria-hidden="true"
    >
      <path d="M28 10 C22 6 12 6 6 9 V42 C12 39 22 39 28 43 Z" fill="#fbbf24" />
      <path
        d="M28 10 C34 6 44 6 50 9 V42 C44 39 34 39 28 43 Z"
        fill="#fb923c"
      />
      <line
        x1="28"
        y1="10"
        x2="28"
        y2="43"
        stroke="#c2410c"
        strokeWidth="1.5"
      />
      <circle cx="17" cy="22" r="4" fill="#fff7ed" />
    </svg>
  );
}

function MathIcon() {
  return (
    <svg
      viewBox="0 0 56 56"
      className="h-12 w-12 drop-shadow sm:h-14 sm:w-14"
      aria-hidden="true"
    >
      <rect x="4" y="24" width="14" height="10" rx="2" fill="#22c55e" />
      <rect x="21" y="24" width="14" height="10" rx="2" fill="#a3e635" />
      <rect x="38" y="24" width="14" height="10" rx="2" fill="#22c55e" />
      <rect x="18" y="4" width="20" height="18" rx="3" fill="#c68a5c" />
      <rect x="22" y="9" width="3" height="3" fill="#2b1a0e" />
      <rect x="31" y="9" width="3" height="3" fill="#2b1a0e" />
      <text
        x="28"
        y="48"
        textAnchor="middle"
        fontSize="18"
        fontWeight="bold"
        fill="#0369a1"
      >
        ×
      </text>
    </svg>
  );
}

function JumpingFrogsIcon() {
  return (
    <svg
      viewBox="0 0 56 48"
      className="h-12 w-12 drop-shadow sm:h-14 sm:w-14"
      aria-hidden="true"
    >
      <ellipse cx="28" cy="40" rx="24" ry="6" fill="#4ade80" opacity="0.7" />
      <ellipse cx="28" cy="24" rx="18" ry="14" fill="#22c55e" />
      <circle cx="19" cy="14" r="5" fill="#22c55e" />
      <circle cx="37" cy="14" r="5" fill="#22c55e" />
      <circle cx="19" cy="13" r="2.5" fill="#052e16" />
      <circle cx="37" cy="13" r="2.5" fill="#052e16" />
      <ellipse cx="28" cy="28" rx="6" ry="4" fill="#166534" />
    </svg>
  );
}

function CocktailIcon() {
  return (
    <svg
      viewBox="0 0 56 56"
      className="h-12 w-12 drop-shadow sm:h-14 sm:w-14"
      aria-hidden="true"
    >
      <path
        d="M14 8 H42 L33 34 Q33 40 28 40 Q23 40 23 34 Z"
        fill="#fef3c7"
        stroke="#d97706"
        strokeWidth="2"
      />
      <path d="M17 12 H39" stroke="#d97706" strokeWidth="2" />
      <line
        x1="28"
        y1="40"
        x2="28"
        y2="50"
        stroke="#94a3b8"
        strokeWidth="2.5"
      />
      <line
        x1="20"
        y1="50"
        x2="36"
        y2="50"
        stroke="#94a3b8"
        strokeWidth="2.5"
      />
      <circle cx="24" cy="22" r="3.5" fill="#f43f5e" />
      <circle cx="32" cy="26" r="3" fill="#84cc16" />
      <circle cx="27" cy="30" r="2.5" fill="#fde047" />
    </svg>
  );
}

function CarIcon() {
  return (
    <svg
      viewBox="0 0 56 56"
      className="h-12 w-12 drop-shadow sm:h-14 sm:w-14"
      aria-hidden="true"
    >
      <path
        d="M8 34 L12 22 Q14 18 19 18 H37 Q42 18 44 22 L48 34 Z"
        fill="#0891b2"
        stroke="#0e7490"
        strokeWidth="2"
      />
      <rect
        x="6"
        y="32"
        width="44"
        height="10"
        rx="4"
        fill="#0891b2"
        stroke="#0e7490"
        strokeWidth="2"
      />
      <path d="M16 20 L20 28 H36 L40 20 Z" fill="#bae6fd" opacity="0.85" />
      <circle cx="17" cy="42" r="5" fill="#1e293b" />
      <circle cx="17" cy="42" r="2" fill="#94a3b8" />
      <circle cx="39" cy="42" r="5" fill="#1e293b" />
      <circle cx="39" cy="42" r="2" fill="#94a3b8" />
    </svg>
  );
}

// A fanned stack of index cards — the study-flashcards feature (/games/cards,
// FlashcardsGroupsPage in @school-ahead/flashcards), distinct from the
// syllable "Картки" game's own CardsIcon above (a matching M/A pair, not a
// stack) so the two read as visually different despite the name clash.
function FlashcardsIcon() {
  return (
    <svg
      viewBox="0 0 56 52"
      className="h-12 w-12 drop-shadow sm:h-14 sm:w-14"
      aria-hidden="true"
    >
      <rect
        x="10"
        y="10"
        width="34"
        height="24"
        rx="3"
        fill="#c7d2fe"
        stroke="#6366f1"
        strokeWidth="2"
        transform="rotate(-8 27 22)"
      />
      <rect
        x="10"
        y="14"
        width="34"
        height="24"
        rx="3"
        fill="#e0e7ff"
        stroke="#6366f1"
        strokeWidth="2"
        transform="rotate(4 27 26)"
      />
      <rect
        x="10"
        y="16"
        width="34"
        height="24"
        rx="3"
        fill="white"
        stroke="#6366f1"
        strokeWidth="2"
      />
      <line
        x1="16"
        y1="24"
        x2="38"
        y2="24"
        stroke="#818cf8"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="30"
        x2="30"
        y2="30"
        stroke="#818cf8"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Each game's own accent color — the thick colored ring around its card
// (see GameCard), so the cards read as distinct at a glance instead of all
// being the same gray box.
const GAME_ACCENT_RING: Record<PreschoolGameId, string> = {
  balloons: "ring-rose-300",
  trains: "ring-sky-300",
  reading: "ring-orange-300",
  cards: "ring-amber-300",
  stories: "ring-violet-300",
  math: "ring-lime-300",
  "jumping-frogs": "ring-emerald-300",
  cocktail: "ring-amber-300",
  cars: "ring-cyan-300",
  flashcards: "ring-indigo-300",
};

// Per-game icon + title translation-key pair, keyed off PreschoolGameId —
// lets GamePicker below build each category's row of cards from a plain
// data list instead of repeating a <GameCard .../> per game. `icon` is the
// SVG fallback GameCoverImage renders when this game's own cover.png/
// cover.jpeg (see GAME_COVER_FOLDER) hasn't been dropped in yet.
const GAME_CATALOG: Record<
  PreschoolGameId,
  { icon: () => ReactNode; titleKey: string }
> = {
  balloons: { icon: BalloonIcon, titleKey: "balloonsTitle" },
  trains: { icon: TrainIcon, titleKey: "trainsTitle" },
  reading: { icon: ReadingIcon, titleKey: "readingTitle" },
  cards: { icon: CardsIcon, titleKey: "cardsTitle" },
  stories: { icon: StoriesIcon, titleKey: "storiesTitle" },
  math: { icon: MathIcon, titleKey: "mathTitle" },
  "jumping-frogs": { icon: JumpingFrogsIcon, titleKey: "jumpingFrogsTitle" },
  cocktail: { icon: CocktailIcon, titleKey: "cocktailTitle" },
  cars: { icon: CarIcon, titleKey: "carsTitle" },
  flashcards: { icon: FlashcardsIcon, titleKey: "flashcardsTitle" },
};

// Where each game's own /static/<folder>/cover.png (or .jpeg) lives — per
// this feature's own request ("зображення гри на картці бери з файлу
// cover.png or cover.jpeg ... folder name = gamename"). Defaults to the
// id itself and is overridden only where the real public/static folder
// actually differs from it: "ballons" is the real (misspelled) folder for
// balloons, and "cards" (plural meaning) is actually the flashcards
// study-library's own folder (see @school-ahead/flashcards) — so the
// *other* "cards" id (the syllable-matching game, now at /games/syllables2
// — see games-page.tsx's GAME_PATH_SEGMENT) is pointed at its own distinct
// "syllables2" folder instead, to avoid the two colliding on the same
// cover image once flashcards gets its own cover.png. "cars" is left at
// the id itself — its cover.jpeg lives in public/static/cars, not
// public/static/cars-game (that folder only has a car.png sprite used by
// the game itself, not a card cover). "reading" (titled "Склади"/Syllables,
// now at /games/syllables — see games-page.tsx's GAME_PATH_SEGMENT) points
// at "syllables" too, not the id itself: its cover.jpeg lives in
// public/static/syllables alongside that folder's per-letter game content,
// not in a public/static/reading that doesn't exist.
const GAME_COVER_FOLDER: Record<PreschoolGameId, string> = {
  balloons: "ballons",
  trains: "trains",
  reading: "syllables",
  cards: "syllables2",
  stories: "stories",
  math: "math",
  "jumping-frogs": "jumping-frogs",
  cocktail: "cocktail",
  cars: "cars",
  flashcards: "cards",
};

// Tries <folder>/cover.png, then <folder>/cover.jpeg, then falls back to
// the game's own SVG icon if neither exists yet. Probing happens with a
// detached Image() in an effect (not an onError chain on the rendered
// <img>) because an onError chain raced React hydration on a full page
// reload: the SSR'd <img src="cover.png"> starts loading, 404s, and fires
// its native error event before hydration finishes attaching our onError
// handler, so the miss stuck every card on the (nonexistent) .png and
// showed a broken image — working only after a client-side navigation,
// which mounts fresh post-hydration so the handler is already attached.
// Probing off-DOM sidesteps that: resolution only ever happens after
// mount, identically on reload and on nav. Fills the whole card (absolute
// inset-0 + object-cover), per this feature's own request ("зображення
// має бути на весь скруглений квадрат") — GameCard's own rounded-2xl +
// overflow-hidden is what actually clips it to match the card's corners,
// this element just covers the box. A still-uncovered game centers its
// SVG fallback the same full box instead, so every card fills the square
// one way or the other.
export function GameCoverImage({
  folder,
  fallback,
}: {
  folder: string;
  fallback: ReactNode;
}) {
  const [resolvedSrc, setResolvedSrc] = useState<string | "failed" | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const candidates = [
      `/static/${folder}/cover.png`,
      `/static/${folder}/cover.jpeg`,
    ];

    function tryCandidate(index: number) {
      if (cancelled) return;
      if (index >= candidates.length) {
        setResolvedSrc("failed");
        return;
      }
      const probe = new window.Image();
      probe.onload = () => {
        if (!cancelled) setResolvedSrc(candidates[index]);
      };
      probe.onerror = () => tryCandidate(index + 1);
      probe.src = candidates[index];
    }

    tryCandidate(0);
    return () => {
      cancelled = true;
    };
  }, [folder]);

  if (resolvedSrc === null || resolvedSrc === "failed") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white">
        {fallback}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedSrc}
      alt=""
      draggable={false}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

// The picker's own grouping into 4 categories — per this feature's own
// request: Cards, Reading, Mathematics, Other. Every PreschoolGameId
// appears in exactly one category. "cards" (the syllable-matching game at
// /games/syllables2) sits under Reading, not Cards — despite the name,
// it's a reading drill; "flashcards" (the subject study-cards library at
// /games/cards) is what Cards actually groups alongside Balloons.
const GAME_CATEGORIES: {
  key: string;
  titleKey: string;
  games: PreschoolGameId[];
}[] = [
  {
    key: "cards",
    titleKey: "categoryCardsTitle",
    games: ["balloons", "flashcards"],
  },
  {
    key: "reading",
    titleKey: "categoryReadingTitle",
    games: ["reading", "stories", "jumping-frogs", "cards"],
  },
  {
    key: "math",
    titleKey: "categoryMathTitle",
    games: ["math", "cocktail", "cars"],
  },
  { key: "other", titleKey: "categoryOtherTitle", games: ["trains"] },
];

// Where each built-in game lives — games-page.tsx's DB-driven picker
// matches a DB Game's `url` against this to find the static cover / SVG
// icon / accent ring to fall back on when no icon was uploaded for it.
export const GAME_URL: Record<PreschoolGameId, string> = {
  balloons: "/games/balloons",
  trains: "/games/trains",
  reading: "/games/syllables",
  cards: "/games/syllables2",
  stories: "/games/stories",
  math: "/games/math",
  "jumping-frogs": "/games/jumping-frogs",
  cocktail: "/games/cocktail",
  cars: "/games/cars",
  flashcards: "/games/cards",
};

// The built-in game a DB Game's `url` points at, if any — see GAME_URL.
export function builtInGameForUrl(url: string): PreschoolGameId | null {
  const path = url.replace(/[?#].*$/, "").replace(/\/+$/, "");
  const match = (Object.keys(GAME_URL) as PreschoolGameId[]).find(
    (game) => GAME_URL[game] === path,
  );
  return match ?? null;
}

// A built-in game's own cover (static cover.png/.jpeg, else its SVG) and
// accent ring — what GamePicker below renders, and what the DB-driven
// picker falls back on for a game with no uploaded icon.
export function builtInGameVisual(game: PreschoolGameId): {
  cover: ReactNode;
  accentRing: string;
} {
  const Icon = GAME_CATALOG[game].icon;
  return {
    cover: (
      <GameCoverImage folder={GAME_COVER_FOLDER[game]} fallback={<Icon />} />
    ),
    accentRing: GAME_ACCENT_RING[game],
  };
}

export function GameCard({
  title,
  cover,
  accentRing,
  onSelect,
}: {
  title: string;
  // Fills the whole card — e.g. GameCoverImage, or an uploaded icon.
  cover: ReactNode;
  accentRing: string;
  onSelect: () => void;
}) {
  return (
    // aspect-square (height following the fixed width, not the content) is
    // what keeps every card square and the same height regardless of title
    // length. `relative` + overflow-hidden on the button is what lets
    // GameCoverImage fill the whole square (per this feature's own request)
    // while still getting clipped to the card's own rounded corners.
    //
    // The title is not printed on the card at rest. It also isn't a native
    // `title` attribute — on some browsers/OSes (e.g. macOS trackpad Force
    // Click) a `title` on a hovered element triggers the OS's own rich
    // Quick Look preview, which is what blew the card up ~3x with the name
    // rendered as its own overlay instead of a small label. This is a
    // fully custom label instead: a group-hover-revealed plaque that lives
    // *inside* the button so it scales, clips, and stays anchored to the
    // card together with it (own bottom-1 pill, not a sibling positioned
    // off the card) rather than tracking the card's edge from outside.
    // hover:z-20 lifts the growing card above its siblings in the
    // flex-wrap row so it isn't clipped underneath them mid-grow.
    // origin-bottom anchors the button's bottom edge in place while
    // growing upward on hover.
    <div className="relative hover:z-20">
      <button
        type="button"
        onClick={onSelect}
        aria-label={title}
        className={`group relative aspect-square w-24 origin-bottom cursor-pointer overflow-hidden rounded-2xl shadow-lg ring-4 transition hover:scale-[2] sm:w-28 ${accentRing}`}
      >
        {cover}
        <span className="absolute inset-x-1 bottom-1 line-clamp-2 rounded-lg bg-white/90 px-1.5 py-0.5 text-[11px] font-bold leading-tight text-gray-700 opacity-0 shadow transition-opacity group-hover:opacity-100 sm:inset-x-1.5 sm:bottom-1.5 sm:px-2 sm:text-xs">
          {title}
        </span>
      </button>
    </div>
  );
}

// One panel of the picker: a category heading plus its game cards.
export interface GamePickerCategory {
  key: string;
  title: string;
  cards: ReactNode;
}

// The picker's layout, shared by GamePicker below (the built-in list, for
// the dashboard celebration) and games-page.tsx's DB-driven /games page.
export function GamePickerGrid({
  title,
  categories,
}: {
  title: string;
  categories: GamePickerCategory[];
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-6 overflow-y-auto p-6 text-center">
      <p className="text-2xl font-bold text-gray-700">{title}</p>
      {/* The page split into equal quadrants, one per category — a 2-column
          CSS grid (single column on a phone, so they're equal-width stacked
          strips there instead) rather than category rows of varying width,
          per this feature's own request ("лист поділений на 4 частини
          рівні"). Each category panel stretches to match the tallest one
          in its row (items-stretch on the grid + h-full on the panel), so
          same-row panels always read as visually equal regardless of how
          many games that category has. */}
      <div className="grid w-full max-w-5xl flex-1 grid-cols-1 items-stretch gap-4 sm:grid-cols-2 sm:gap-6">
        {categories.map((category) => (
          <div
            key={category.key}
            className="flex h-full flex-col items-center gap-4 rounded-3xl bg-white/70 p-4 shadow-lg ring-2 ring-gray-200 sm:p-6"
          >
            <h2 className="text-lg font-bold text-gray-600 sm:text-xl">
              {category.title}
            </h2>
            {/* flex-wrap (not a single fixed row) — however many games a
                category has, this wraps into as many rows as the panel's
                own width needs. */}
            <div className="flex flex-1 flex-wrap items-start justify-center gap-3 sm:gap-4">
              {category.cards}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// The built-in picker — the dashboard's end-of-lessons celebration
// (PreschoolCelebration below) plays the chosen game inline via local
// state. The standalone /games page lists games from the DB instead (see
// games-page.tsx).
export function GamePicker({
  title,
  onSelect,
}: {
  title: string;
  onSelect: (game: PreschoolGameId) => void;
}) {
  const t = useTranslations("PreschoolGameChoice");
  return (
    <GamePickerGrid
      title={title}
      categories={GAME_CATEGORIES.map((category) => ({
        key: category.key,
        title: t(category.titleKey),
        cards: category.games.map((game) => (
          <GameCard
            key={game}
            title={t(GAME_CATALOG[game].titleKey)}
            {...builtInGameVisual(game)}
            onSelect={() => onSelect(game)}
          />
        )),
      }))}
    />
  );
}

export function PreschoolCelebration({
  title,
}: {
  title?: string;
} = {}) {
  const t = useTranslations("PreschoolGameChoice");
  const tChrome = useTranslations("PreschoolChrome");
  const [selectedGame, setSelectedGame] = useState<PreschoolGameId | null>(
    null,
  );

  if (!selectedGame) {
    // The site header used to be the way out of here; a student in preschool
    // mode has none, so the picker brings a 🏠 to the dashboard (a chosen game
    // has its own, back to this picker — below).
    return (
      <>
        <HomeButton href="/" label={tChrome("homeLabel")} />
        <GamePicker title={title ?? t("title")} onSelect={setSelectedGame} />
      </>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col">
      {selectedGame === "balloons" ? (
        <div className="flex flex-1 flex-col p-2 sm:p-4">
          <BalloonPopGame />
        </div>
      ) : selectedGame === "reading" ? (
        <div className="flex flex-1 flex-col p-2 sm:p-4">
          <ReadingGame />
        </div>
      ) : selectedGame === "cards" ? (
        <div className="flex flex-1 flex-col p-2 sm:p-4">
          <CardsGame />
        </div>
      ) : selectedGame === "stories" ? (
        <div className="flex flex-1 flex-col p-2 sm:p-4">
          <StoriesGame />
        </div>
      ) : selectedGame === "math" ? (
        <div className="flex flex-1 flex-col p-2 sm:p-4">
          <MathGame />
        </div>
      ) : (
        <TrainsGame />
      )}
      <HomeButton onClick={() => setSelectedGame(null)} />
      <GameMusic />
    </div>
  );
}
