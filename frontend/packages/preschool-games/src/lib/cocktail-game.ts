// Pure logic for the "Magic Cocktail" preschool minigame — see docs/
// preschool/games/cocktail.md for the design brief. No React/DOM here, same
// testability contract as lib/jumping-frogs-game.ts/lib/math-game.ts.

export interface CocktailIngredient {
  key: string;
  emoji: string;
  // The glass liquid's tint while this ingredient is present — mixed with
  // every other present ingredient's color, see cocktail-game.tsx's
  // mixLiquidColors (a presentational concern, kept out of this file).
  color: string;
}

// A small, fixed catalog — "фрукти, ягоди та сиропи" (fruits, berries, and
// syrups) per the brief. Kept short enough that a preschooler can visually
// tell every piece apart at a glance.
export const COCKTAIL_INGREDIENTS: CocktailIngredient[] = [
  { key: "strawberry", emoji: "🍓", color: "#f43f5e" },
  { key: "banana", emoji: "🍌", color: "#fde047" },
  { key: "blueberry", emoji: "🫐", color: "#6366f1" },
  { key: "orange", emoji: "🍊", color: "#fb923c" },
  { key: "kiwi", emoji: "🥝", color: "#84cc16" },
  { key: "syrup", emoji: "🍯", color: "#d97706" },
];

export interface CocktailRecipeItem {
  key: string;
  count: number;
}

export type CocktailRecipe = CocktailRecipeItem[];

// Always exactly 2 types (not the brief's original 2-3) — the round now
// opens with an addition-equation gate (see equationFor below) built
// directly from the recipe's own two counts, and a two-addend "a + b = ?"
// reads far more clearly to a preschooler than trying to sum three.
const RECIPE_TYPE_COUNT = 2;
const RECIPE_ITEM_COUNT_RANGE = [1, 3] as const;

// How many wrong-type pieces get scattered on the table alongside the
// recipe's own pieces — with none, hint mode would have nothing to ever
// reject and free mode nothing to ever get wrong, so both modes lean on
// this for their actual challenge, not just the counting itself.
const OFF_RECIPE_DISTRACTOR_COUNT = 5;

// Extra copies of ingredients the recipe DOES call for, beyond the exact
// count needed — without these, "grab every banana in sight" always
// happens to be correct, so there's nothing forcing the child to actually
// track how many they've already dropped versus the recipe card's count.
const EXTRA_ON_RECIPE_COUNT = 3;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// A random 2-ingredient recipe with 1-3 of each, e.g. "2 strawberries + 3
// bananas" — a trimmed-down version of the brief's own worked example (see
// RECIPE_TYPE_COUNT's comment for why only 2, not 2-3).
export function generateRecipe(pool: CocktailIngredient[] = COCKTAIL_INGREDIENTS): CocktailRecipe {
  const typeCount = Math.min(RECIPE_TYPE_COUNT, pool.length);
  const chosen = shuffle(pool).slice(0, typeCount);
  return chosen.map((ingredient) => ({ key: ingredient.key, count: randomInt(...RECIPE_ITEM_COUNT_RANGE) }));
}

export interface CocktailEquation {
  a: number;
  b: number;
  sum: number;
}

// The round-opening "how many pieces does this recipe need in total"
// addition problem — literally just the recipe's own two counts, so
// solving it doubles as previewing the recipe before it's shown. Falls
// back to (0,0,0) for a malformed (non-2-item) recipe rather than
// throwing, since generateRecipe's own contract already guarantees 2 items
// and a caller passing something else is a programming error, not a case
// worth crashing the game over.
export function equationFor(recipe: CocktailRecipe): CocktailEquation {
  const [first, second] = recipe;
  if (!first || !second) return { a: 0, b: 0, sum: 0 };
  return { a: first.count, b: second.count, sum: first.count + second.count };
}

// Plausible near-miss wrong answers (off by 1-2 either way) rather than
// wildly unrelated numbers — a preschooler learning to add should be
// tripped up by "close but wrong," not asked to spot an absurd outlier.
// Clamped to >= MIN_RECIPE_SUM (the smallest two 1-count ingredients can
// ever sum to) so a distractor never reads as an impossible negative/zero
// total. Sorted ascending like math-game.ts's own hotbar, for the same
// "the layout is the hint, no numbered labels needed" reason.
const MIN_RECIPE_SUM = RECIPE_ITEM_COUNT_RANGE[0] * 2;

export function buildEquationChoices(sum: number, choiceCount = 4): { choices: number[]; correctIndex: number } {
  const candidates = shuffle([sum - 2, sum - 1, sum + 1, sum + 2].filter((n) => n >= MIN_RECIPE_SUM && n !== sum));
  const distractors = candidates.slice(0, choiceCount - 1);
  const choices = [sum, ...distractors].sort((x, y) => x - y);
  return { choices, correctIndex: choices.indexOf(sum) };
}

export interface CocktailTablePiece {
  id: string;
  key: string;
}

// One tappable piece per unit the recipe actually needs (so there's always
// at least enough of everything correct), plus EXTRA_ON_RECIPE_COUNT more
// pieces of ingredients the recipe DOES call for (so the table always has
// more of at least one recipe ingredient than is actually needed — see
// that constant's own comment) and OFF_RECIPE_DISTRACTOR_COUNT pieces of
// ingredients it doesn't call for at all. Falls back to reusing recipe
// ingredients for the off-recipe distractors if the pool is too thin to
// have any (never happens with the real COCKTAIL_INGREDIENTS catalog, but
// keeps this from crashing on a hypothetically small custom pool).
export function buildTable(recipe: CocktailRecipe, pool: CocktailIngredient[] = COCKTAIL_INGREDIENTS): CocktailTablePiece[] {
  const recipeKeys = new Set(recipe.map((item) => item.key));
  const pieces: CocktailTablePiece[] = [];
  let nextId = 0;
  for (const item of recipe) {
    for (let i = 0; i < item.count; i++) {
      pieces.push({ id: `piece-${nextId++}`, key: item.key });
    }
  }
  for (let i = 0; i < EXTRA_ON_RECIPE_COUNT && recipe.length > 0; i++) {
    const item = recipe[Math.floor(Math.random() * recipe.length)];
    pieces.push({ id: `piece-${nextId++}`, key: item.key });
  }
  const distractorPool = pool.filter((ingredient) => !recipeKeys.has(ingredient.key));
  const distractorSource = distractorPool.length > 0 ? distractorPool : pool;
  for (let i = 0; i < OFF_RECIPE_DISTRACTOR_COUNT; i++) {
    const ingredient = distractorSource[Math.floor(Math.random() * distractorSource.length)];
    pieces.push({ id: `piece-${nextId++}`, key: ingredient.key });
  }
  return shuffle(pieces);
}

function countByKey(keys: string[], key: string): number {
  return keys.filter((k) => k === key).length;
}

// How many more of `key` the recipe still calls for, given what's already
// in the glass — 0 once enough (or too many) have gone in.
export function remainingNeeded(recipe: CocktailRecipe, dropped: string[], key: string): number {
  const needed = recipe.find((item) => item.key === key)?.count ?? 0;
  return Math.max(0, needed - countByKey(dropped, key));
}

// Hint mode's accept/reject check for one tapped piece: still short of this
// key's own recipe count, and not some type absent from the recipe
// entirely. `needed` covers both — 0 for an off-recipe key already.
export function isIngredientNeeded(recipe: CocktailRecipe, dropped: string[], key: string): boolean {
  return remainingNeeded(recipe, dropped, key) > 0;
}

// Free mode's shaker-button check: every recipe key's count matched exactly
// AND nothing extra (an off-recipe key, or too many of an on-recipe one)
// made it in — "рецепт не вірний" covers both directions, not just "at
// least enough".
export function isRecipeExactlyMet(recipe: CocktailRecipe, dropped: string[]): boolean {
  if (dropped.length !== recipe.reduce((sum, item) => sum + item.count, 0)) return false;
  return recipe.every((item) => countByKey(dropped, item.key) === item.count);
}
