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

const RECIPE_TYPE_COUNT_RANGE = [2, 3] as const;
const RECIPE_ITEM_COUNT_RANGE = [1, 3] as const;

// How many wrong-type pieces get scattered on the table alongside the
// recipe's own pieces — with none, hint mode would have nothing to ever
// reject and free mode nothing to ever get wrong, so both modes lean on
// this for their actual challenge, not just the counting itself.
const DISTRACTOR_COUNT = 3;

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

// A random 2-3-ingredient recipe with 1-3 of each, e.g. "2 strawberries + 3
// bananas + 1 syrup" — the brief's own worked example.
export function generateRecipe(pool: CocktailIngredient[] = COCKTAIL_INGREDIENTS): CocktailRecipe {
  const typeCount = Math.min(randomInt(...RECIPE_TYPE_COUNT_RANGE), pool.length);
  const chosen = shuffle(pool).slice(0, typeCount);
  return chosen.map((ingredient) => ({ key: ingredient.key, count: randomInt(...RECIPE_ITEM_COUNT_RANGE) }));
}

export interface CocktailTablePiece {
  id: string;
  key: string;
}

// One tappable piece per unit the recipe actually needs (so there's always
// exactly enough of everything correct), plus DISTRACTOR_COUNT wrong-type
// pieces drawn from ingredients the recipe doesn't call for at all — falls
// back to reusing recipe ingredients if the pool is too thin to have any
// (never happens with the real COCKTAIL_INGREDIENTS catalog, but keeps this
// from crashing on a hypothetically small custom pool).
export function buildTable(recipe: CocktailRecipe, pool: CocktailIngredient[] = COCKTAIL_INGREDIENTS): CocktailTablePiece[] {
  const recipeKeys = new Set(recipe.map((item) => item.key));
  const pieces: CocktailTablePiece[] = [];
  let nextId = 0;
  for (const item of recipe) {
    for (let i = 0; i < item.count; i++) {
      pieces.push({ id: `piece-${nextId++}`, key: item.key });
    }
  }
  const distractorPool = pool.filter((ingredient) => !recipeKeys.has(ingredient.key));
  const distractorSource = distractorPool.length > 0 ? distractorPool : pool;
  for (let i = 0; i < DISTRACTOR_COUNT; i++) {
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
