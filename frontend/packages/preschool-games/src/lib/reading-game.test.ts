import { describe, expect, it } from "vitest";
import { compareSyllables, selectLevel, sortConsonants, type ReadingGameCard } from "./reading-game";

const CARDS: ReadingGameCard[] = [
  { key: "Мавпа", image: "/Мавпа.png", syllable: "МА", sound: null },
  { key: "Морква", image: "/Морква.png", syllable: "МО", sound: "/Морква.mp3" },
  { key: "Морозиво", image: "/Морозиво.png", syllable: "МО", sound: "/Морозиво.mp3" },
  { key: "Муха", image: "/Муха.png", syllable: "МУ", sound: null },
  { key: "Мед", image: "/Мед.png", syllable: "МЕ", sound: null },
  { key: "Миша", image: "/Миша.png", syllable: "МИ", sound: null },
  { key: "Місяць", image: "/Місяць.png", syllable: "МІ", sound: null },
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

  it("caps the tray at round(syllableCount * 1.5) cards when more pictures are available", () => {
    const manyCards: ReadingGameCard[] = Array.from({ length: 8 }, (_, i) => ({
      key: `Слово${i}`,
      image: `/w${i}.png`,
      syllable: "МА",
      sound: null,
    }));

    const { cards } = selectLevel(manyCards, 1);
    expect(cards).toHaveLength(2); // round(1 * 1.5)
    expect(new Set(cards.map((c) => c.key)).size).toBe(2); // no duplicates
  });

  it("keeps at least one card per active syllable even when capping", () => {
    const manyCards: ReadingGameCard[] = Array.from({ length: 8 }, (_, i) => ({
      key: `Слово${i}`,
      image: `/w${i}.png`,
      syllable: "МА",
      sound: null,
    }));
    const twoSyllableCards = [...manyCards, { key: "Мед", image: "/Мед.png", syllable: "МЕ", sound: null }];

    const { syllables, cards } = selectLevel(twoSyllableCards, 2); // cap = round(2 * 1.5) = 3
    expect(syllables).toEqual(["МА", "МЕ"]);
    expect(cards).toHaveLength(3);
    expect(cards.some((c) => c.syllable === "МЕ")).toBe(true);
  });
});

describe("sortConsonants", () => {
  it("orders the pedagogical consonants first, then unlisted ones alphabetically", () => {
    expect(sortConsonants(["П", "Т", "Ж", "М", "Б"])).toEqual(["М", "Т", "Б", "П", "Ж"]);
  });
});
