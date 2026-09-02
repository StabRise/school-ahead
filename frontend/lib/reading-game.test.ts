import { describe, expect, it } from "vitest";
import { compareSyllables, selectLevel, sortConsonants, type ReadingGameCard } from "./reading-game";

const CARDS: ReadingGameCard[] = [
  { key: "Мавпа", image: "/Мавпа.png", syllable: "МА" },
  { key: "Морква", image: "/Морква.png", syllable: "МО" },
  { key: "Морозиво", image: "/Морозиво.png", syllable: "МО" },
  { key: "Муха", image: "/Муха.png", syllable: "МУ" },
  { key: "Мед", image: "/Мед.png", syllable: "МЕ" },
  { key: "Миша", image: "/Миша.png", syllable: "МИ" },
  { key: "Місяць", image: "/Місяць.png", syllable: "МІ" },
];

describe("compareSyllables", () => {
  it("orders syllables by vowel per the А О У Е И І Я Ю Є sequence", () => {
    const syllables = ["МІ", "МЕ", "МА", "МУ", "МО"];
    expect([...syllables].sort(compareSyllables)).toEqual(["МА", "МО", "МУ", "МЕ", "МІ"]);
  });
});

describe("selectLevel", () => {
  it("keeps only the first N syllables in vowel order, with every card for those syllables", () => {
    const { syllables, cards } = selectLevel(CARDS, 3);
    expect(syllables).toEqual(["МА", "МО", "МУ"]);
    expect(cards.map((c) => c.key).sort()).toEqual(["Мавпа", "Морква", "Морозиво", "Муха"].sort());
  });

  it("can include more picture cards than distinct syllables (a syllable shared by two words)", () => {
    const { syllables, cards } = selectLevel(CARDS, 2);
    expect(syllables).toEqual(["МА", "МО"]);
    expect(cards).toHaveLength(3); // Мавпа + Морква + Морозиво
  });

  it("caps at every available syllable once the count exceeds them", () => {
    const { syllables } = selectLevel(CARDS, 9);
    expect(syllables).toEqual(["МА", "МО", "МУ", "МЕ", "МИ", "МІ"]);
  });
});

describe("sortConsonants", () => {
  it("orders the pedagogical consonants first, then unlisted ones alphabetically", () => {
    expect(sortConsonants(["П", "Т", "Ж", "М", "Б"])).toEqual(["М", "Т", "Б", "П", "Ж"]);
  });
});
