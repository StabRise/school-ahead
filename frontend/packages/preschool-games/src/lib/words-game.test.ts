import { describe, expect, it } from "vitest";
import type { SyllableOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { isVowel, splitIntoReadingSegments, syllableForDisplay, toWordsGameCards } from "./words-game";

describe("splitIntoReadingSegments", () => {
  it.each([
    ["вовк", ["во", "в", "к"]],
    ["баба", ["ба", "ба"]],
    ["лисичка", ["ли", "си", "ч", "ка"]],
    ["зупинив", ["зу", "пи", "ни", "в"]],
    ["дурний", ["ду", "р", "ни", "й"]],
    ["ведмідь", ["ве", "д", "мі", "дь"]],
    ["Мама", ["Ма", "ма"]],
    ["апельсин", ["а", "пе", "ль", "си", "н"]],
    ["м'яч", ["м'я", "ч"]],
    ["banana", ["ba", "na", "na"]],
    ["mleko", ["m", "le", "ko"]],
    ["morze", ["mo", "rze"]],
    ["Rzeka", ["Rze", "ka"]],
    ["szafa", ["sza", "fa"]],
    ["chleb", ["ch", "le", "b"]],
    ["kaczka", ["ka", "cz", "ka"]],
  ])("%s", (word, segments) => {
    expect(splitIntoReadingSegments(word)).toEqual(segments);
  });
});

describe("isVowel", () => {
  it("knows Ukrainian and Latin vowels", () => {
    expect(["а", "Ї", "e", "Ó", "ą"].every(isVowel)).toBe(true);
    expect(["м", "B", "ь"].some(isVowel)).toBe(false);
  });
});

describe("toWordsGameCards", () => {
  const row = (id: number, second: string, word: string, icon: string | null = "x.png"): SyllableOut => ({
    id,
    first_letter: "М",
    second_part: second,
    word,
    language: "uk",
    is_default: false,
    icon,
    syllable_audio: null,
    word_audio: null,
  });

  it("drops cards without a picture and orders by vowel, then word", () => {
    const cards = toWordsGameCards(
      [row(1, "У", "Муха"), row(2, "А", "Мак"), row(3, "О", "Море", null), row(4, "А", "Мавпа")],
      "uk",
    );
    expect(cards.map((card) => card.word)).toEqual(["Мавпа", "Мак", "Муха"]);
    expect(cards[0].syllable).toBe("МА");
  });
});

describe("syllableForDisplay", () => {
  it("capitalizes the first letter only", () => {
    expect(syllableForDisplay("МА", "uk")).toBe("Ма");
    expect(syllableForDisplay("mo", "pl")).toBe("Mo");
    expect(syllableForDisplay("ЇЖ", "uk")).toBe("Їж");
  });
});
