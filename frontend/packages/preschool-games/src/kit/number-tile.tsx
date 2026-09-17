import type { CSSProperties } from "react";

// The square number tile the cars/cocktail equation screens are built from —
// both their tappable answer choices and the "= ?" slot inside the equation
// itself. Sized to land on the same 7rem square (glyph at half that) that
// math-game.tsx's hotbar measures out to at full width, so a digit reads the
// same size in all three games, and scaling with the viewport below that cap
// so a row of four still fits a phone.
export const NUMBER_TILE_MAX_REM = 7;

export const numberTileSizeStyle: CSSProperties = {
  width: `clamp(3rem, 18vw, ${NUMBER_TILE_MAX_REM}rem)`,
  fontSize: `clamp(1.5rem, 9vw, ${NUMBER_TILE_MAX_REM / 2}rem)`,
};

export const NUMBER_TILE_CLASS =
  "flex aspect-square shrink-0 items-center justify-center rounded-md border-4 font-extrabold shadow-inner transition";

// The operands and operators standing next to a number tile — deliberately a
// touch smaller than the tile's own glyph so the answer stays the focal point.
export const equationFontSizeStyle: CSSProperties = { fontSize: "clamp(2rem, 11vw, 5rem)" };
export const equationOperatorFontSizeStyle: CSSProperties = { fontSize: "clamp(1.5rem, 7vw, 3.5rem)" };

// "correct"/"incorrect" flash green/red on a pick; "dimmed" (math-game.tsx's
// hotbar only, once a round is decided) fades every other, unpicked tile.
// Each variant carries its own text color rather than relying on a shared
// default (see NumberTileButton below) — two same-property Tailwind
// utilities on one element race on generated-CSS order, not JSX order, so a
// status's text color has to fully own its own class string to reliably win.
export type NumberTileStatus = "default" | "incorrect" | "correct" | "dimmed";

const NUMBER_TILE_STATUS_CLASS: Record<NumberTileStatus, string> = {
  default: "border-gray-400 bg-gray-200 text-gray-800 hover:bg-gray-300",
  incorrect: "border-red-400 bg-red-100 text-gray-800 ring-4 ring-red-300",
  correct: "border-emerald-400 bg-emerald-100 text-emerald-700 ring-4 ring-emerald-300",
  dimmed: "border-gray-300 bg-gray-100 text-gray-800 opacity-50",
};

// The tappable number tile itself — one square button, shared by
// math-game.tsx's hotbar and cars-game.tsx's/cocktail-game.tsx's equation
// answer choices (previously three separate near-identical implementations).
export function NumberTileButton({
  value,
  status = "default",
  disabled = false,
  fontSizePx,
  fillParent = false,
  onClick,
}: {
  value: number;
  status?: NumberTileStatus;
  disabled?: boolean;
  // Explicit pixel font size — math-game.tsx measures its hotbar's own
  // rendered width live (ResizeObserver) and shrinks the glyph for longer
  // numbers (see its hotbarFontSizePx), which only makes sense combined with
  // fillParent below. Ignored (and unnecessary) for a tile sizing itself off
  // numberTileSizeStyle's own viewport-relative clamp.
  fontSizePx?: number;
  // True for a tile sized by its CSS Grid cell (math-game.tsx's hotbar, one
  // column per choice) rather than off numberTileSizeStyle's fixed width —
  // still a square, via NUMBER_TILE_CLASS's aspect-square, just with no
  // explicit width of its own so the grid controls it.
  fillParent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={fillParent ? (fontSizePx !== undefined ? { fontSize: fontSizePx } : undefined) : numberTileSizeStyle}
      className={`${NUMBER_TILE_CLASS} cursor-pointer ${
        fillParent && fontSizePx === undefined ? "text-xl sm:text-3xl" : ""
      } ${NUMBER_TILE_STATUS_CLASS[status]}`}
    >
      {value}
    </button>
  );
}
