import { describe, expect, it } from "vitest";
import {
  buildEquationChoices,
  buildTable,
  COCKTAIL_INGREDIENTS,
  equationFor,
  generateRecipe,
  isIngredientNeeded,
  isRecipeExactlyMet,
  remainingNeeded,
  type CocktailRecipe,
} from "./cocktail-game";

describe("generateRecipe", () => {
  it("picks exactly 2 distinct ingredient types with 1-3 of each", () => {
    for (let i = 0; i < 50; i++) {
      const recipe = generateRecipe();
      expect(recipe.length).toBe(2);
      const keys = recipe.map((item) => item.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const item of recipe) {
        expect(item.count).toBeGreaterThanOrEqual(1);
        expect(item.count).toBeLessThanOrEqual(3);
        expect(COCKTAIL_INGREDIENTS.some((ingredient) => ingredient.key === item.key)).toBe(true);
      }
    }
  });

  it("never asks for more types than a thin pool has", () => {
    const recipe = generateRecipe(COCKTAIL_INGREDIENTS.slice(0, 1));
    expect(recipe).toEqual([{ key: COCKTAIL_INGREDIENTS[0].key, count: expect.any(Number) }]);
  });
});

describe("equationFor", () => {
  it("sums the recipe's own two counts", () => {
    const recipe: CocktailRecipe = [
      { key: "banana", count: 2 },
      { key: "strawberry", count: 3 },
    ];
    expect(equationFor(recipe)).toEqual({ a: 2, b: 3, sum: 5 });
  });

  it("falls back to zeros for a malformed single-item recipe", () => {
    expect(equationFor([{ key: "banana", count: 2 }])).toEqual({ a: 0, b: 0, sum: 0 });
  });
});

describe("buildEquationChoices", () => {
  it("always includes the correct sum at correctIndex", () => {
    for (let sum = 2; sum <= 6; sum++) {
      const { choices, correctIndex } = buildEquationChoices(sum);
      expect(choices[correctIndex]).toBe(sum);
    }
  });

  it("sorts choices ascending with no duplicates", () => {
    const { choices } = buildEquationChoices(4);
    expect(choices).toEqual([...choices].sort((x, y) => x - y));
    expect(new Set(choices).size).toBe(choices.length);
  });

  it("never offers a sum below the smallest two ingredients could add to", () => {
    for (let i = 0; i < 20; i++) {
      const { choices } = buildEquationChoices(3);
      for (const choice of choices) expect(choice).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("buildTable", () => {
  const recipe: CocktailRecipe = [
    { key: "strawberry", count: 2 },
    { key: "banana", count: 3 },
  ];

  it("includes at least enough of every recipe ingredient", () => {
    const table = buildTable(recipe);
    expect(table.filter((piece) => piece.key === "strawberry").length).toBeGreaterThanOrEqual(2);
    expect(table.filter((piece) => piece.key === "banana").length).toBeGreaterThanOrEqual(3);
  });

  it("scatters extra on-recipe pieces beyond the exact count needed", () => {
    const recipeTotal = recipe.reduce((sum, item) => sum + item.count, 0);
    const onRecipeCount = buildTable(recipe).filter((piece) =>
      recipe.some((item) => item.key === piece.key),
    ).length;
    expect(onRecipeCount).toBeGreaterThan(recipeTotal);
  });

  it("adds distractor pieces of types the recipe doesn't call for", () => {
    const table = buildTable(recipe);
    const recipeKeys = new Set(recipe.map((item) => item.key));
    const distractors = table.filter((piece) => !recipeKeys.has(piece.key));
    expect(distractors.length).toBeGreaterThan(0);
    for (const piece of distractors) {
      expect(recipeKeys.has(piece.key)).toBe(false);
    }
  });

  it("gives every piece a unique id", () => {
    const table = buildTable(recipe);
    expect(new Set(table.map((piece) => piece.id)).size).toBe(table.length);
  });
});

describe("remainingNeeded / isIngredientNeeded", () => {
  const recipe: CocktailRecipe = [
    { key: "strawberry", count: 2 },
    { key: "banana", count: 1 },
  ];

  it("is the full count with nothing dropped yet", () => {
    expect(remainingNeeded(recipe, [], "strawberry")).toBe(2);
    expect(isIngredientNeeded(recipe, [], "strawberry")).toBe(true);
  });

  it("counts down as matching pieces are dropped", () => {
    expect(remainingNeeded(recipe, ["strawberry"], "strawberry")).toBe(1);
    expect(isIngredientNeeded(recipe, ["strawberry", "strawberry"], "strawberry")).toBe(false);
  });

  it("is never negative once over-filled", () => {
    expect(remainingNeeded(recipe, ["strawberry", "strawberry", "strawberry"], "strawberry")).toBe(0);
  });

  it("is always false for a key the recipe never asked for", () => {
    expect(isIngredientNeeded(recipe, [], "kiwi")).toBe(false);
  });
});

describe("isRecipeExactlyMet", () => {
  const recipe: CocktailRecipe = [
    { key: "strawberry", count: 2 },
    { key: "banana", count: 1 },
  ];

  it("is true only once every count matches exactly", () => {
    expect(isRecipeExactlyMet(recipe, ["strawberry", "strawberry", "banana"])).toBe(true);
    expect(isRecipeExactlyMet(recipe, ["strawberry", "banana"])).toBe(false);
  });

  it("is false with an extra off-recipe ingredient", () => {
    expect(isRecipeExactlyMet(recipe, ["strawberry", "strawberry", "banana", "kiwi"])).toBe(false);
  });

  it("is false with too many of an on-recipe ingredient", () => {
    expect(isRecipeExactlyMet(recipe, ["strawberry", "strawberry", "strawberry", "banana"])).toBe(false);
  });

  it("is true for an empty recipe with nothing dropped", () => {
    expect(isRecipeExactlyMet([], [])).toBe(true);
  });
});
