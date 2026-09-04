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
  it("picks N random syllables (count <= 6), with every card for those syllables", () => {
    const { syllables, cards } = selectLevel(CARDS, 3);
    expect(syllables).toHaveLength(3);
    expect(new Set(syllables).size).toBe(3); // no duplicates
    for (const syllable of syllables) expect(CARDS.some((c) => c.syllable === syllable)).toBe(true);
    expect(cards.every((c) => syllables.includes(c.syllable))).toBe(true);
    expect(cards.map((c) => c.key).sort()).toEqual(
      CARDS.filter((c) => syllables.includes(c.syllable))
        .map((c) => c.key)
        .sort(),
    );
  });

  it("can include more picture cards than distinct syllables (a syllable shared by two words)", () => {
    const { syllables, cards } = selectLevel(CARDS, 2);
    expect(syllables).toHaveLength(2);
    expect(cards).toHaveLength(syllables.includes("МО") ? 3 : 2); // МО alone has 2 cards (Морква + Морозиво)
  });

  it("caps at every available syllable, in vowel order, once the count exceeds 6", () => {
    const { syllables } = selectLevel(CARDS, 9);
    expect(syllables).toEqual(["МА", "МО", "МУ", "МЕ", "МИ", "МІ"]);
  });

  it("varies the chosen syllables and their order across calls when count <= 6", () => {
    const orders = new Set(Array.from({ length: 30 }, () => selectLevel(CARDS, 4).syllables.join(",")));
    expect(orders.size).toBeGreaterThan(1);
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
    expect([...syllables].sort()).toEqual(["МА", "МЕ"]);
    expect(cards).toHaveLength(3);
    expect(cards.some((c) => c.syllable === "МЕ")).toBe(true);
  });
});

describe("sortConsonants", () => {
  it("orders the pedagogical consonants first, then unlisted ones alphabetically", () => {
    expect(sortConsonants(["П", "Т", "Ж", "М", "Б"])).toEqual(["М", "Т", "Б", "П", "Ж"]);
  });
});
