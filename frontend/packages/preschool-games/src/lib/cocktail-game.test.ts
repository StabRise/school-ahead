import { describe, expect, it } from "vitest";
import {
  buildTable,
  COCKTAIL_INGREDIENTS,
  generateRecipe,
  isIngredientNeeded,
  isRecipeExactlyMet,
  remainingNeeded,
  type CocktailRecipe,
} from "./cocktail-game";

describe("generateRecipe", () => {
  it("picks 2-3 distinct ingredient types with 1-3 of each", () => {
    for (let i = 0; i < 50; i++) {
      const recipe = generateRecipe();
      expect(recipe.length).toBeGreaterThanOrEqual(2);
      expect(recipe.length).toBeLessThanOrEqual(3);
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

describe("buildTable", () => {
  const recipe: CocktailRecipe = [
    { key: "strawberry", count: 2 },
    { key: "banana", count: 3 },
  ];

  it("includes exactly enough of every recipe ingredient", () => {
    const table = buildTable(recipe);
    expect(table.filter((piece) => piece.key === "strawberry")).toHaveLength(2);
    expect(table.filter((piece) => piece.key === "banana")).toHaveLength(3);
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
