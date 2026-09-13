import { describe, expect, it } from "vitest";
import { describeIngredientForSpeech, describeRecipeForSpeech } from "./cocktail-speech-pl";

describe("describeIngredientForSpeech", () => {
  it("spells out count 1 as a gendered word, not a digit", () => {
    expect(describeIngredientForSpeech({ key: "banana", count: 1 })).toBe("jeden banan");
    expect(describeIngredientForSpeech({ key: "strawberry", count: 1 })).toBe("jedną truskawkę");
    expect(describeIngredientForSpeech({ key: "kiwi", count: 1 })).toBe("jedno kiwi");
  });

  it("uses a digit plus the plural noun form for counts 2-3", () => {
    expect(describeIngredientForSpeech({ key: "kiwi", count: 2 })).toBe("2 kiwi");
    expect(describeIngredientForSpeech({ key: "strawberry", count: 3 })).toBe("3 truskawki");
    expect(describeIngredientForSpeech({ key: "syrup", count: 2 })).toBe("2 łyżki miodu");
  });

  it("falls back to a plain count+key for an unknown ingredient", () => {
    expect(describeIngredientForSpeech({ key: "mystery", count: 2 })).toBe("2 mystery");
  });
});

describe("describeRecipeForSpeech", () => {
  it("joins both recipe items with \"i\"", () => {
    expect(
      describeRecipeForSpeech([
        { key: "kiwi", count: 2 },
        { key: "syrup", count: 1 },
      ]),
    ).toBe("2 kiwi i jedną łyżkę miodu");
  });
});
