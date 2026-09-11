import { describe, expect, it } from "vitest";
import { buildLetterLevel, buildLevel, buildSyllableLevel, splitUkrainianSyllables } from "./jumping-frogs-game";
import type { ReadingGameCard } from "./reading-game";

describe("splitUkrainianSyllables", () => {
  it("groups a consonant with its following vowel, per the brief's worked examples", () => {
    expect(splitUkrainianSyllables("Мавпа")).toEqual(["Ма", "в", "па"]);
    expect(splitUkrainianSyllables("Яблуко")).toEqual(["Я", "б", "лу", "ко"]);
    expect(splitUkrainianSyllables("Торт")).toEqual(["То", "р", "т"]);
    expect(splitUkrainianSyllables("Маяк")).toEqual(["Ма", "я", "к"]);
  });

  it("handles a single-letter word", () => {
    expect(splitUkrainianSyllables("А")).toEqual(["А"]);
    expect(splitUkrainianSyllables("Б")).toEqual(["Б"]);
  });

  it("handles an all-vowel word", () => {
    expect(splitUkrainianSyllables("Ая")).toEqual(["А", "я"]);
  });

  it("handles a trailing apostrophe as its own group", () => {
    expect(splitUkrainianSyllables("м'яч")).toEqual(["м", "'", "я", "ч"]);
  });

  it("joins a soft sign (ь) onto the card right before it, never its own group", () => {
    expect(splitUkrainianSyllables("Місяць")).toEqual(["Мі", "ся", "ць"]);
    expect(splitUkrainianSyllables("Мідь")).toEqual(["Мі", "дь"]);
    expect(splitUkrainianSyllables("Кінь")).toEqual(["Кі", "нь"]);
  });
});

const CARDS: ReadingGameCard[] = [
  { key: "Мавпа", image: "/Мавпа.png", syllable: "МА", sound: null },
  { key: "Морква", image: "/Морква.png", syllable: "МО", sound: "/Морква.mp3" },
  { key: "Муха", image: "/Муха.png", syllable: "МУ", sound: null },
  { key: "Мед", image: "/Мед.png", syllable: "МЕ", sound: null },
  { key: "Миша", image: "/Миша.png", syllable: "МИ", sound: null },
];

describe("buildLevel", () => {
  it("returns null for an empty card pool", () => {
    expect(buildLevel([])).toBeNull();
  });

  it("builds 5 rows of 3 options each, with the target appearing exactly once per row at correctIndex", () => {
    const level = buildLevel(CARDS);
    expect(level).not.toBeNull();
    expect(level!.rows).toHaveLength(5);
    for (const row of level!.rows) {
      expect(row.options).toHaveLength(3);
      expect(row.options[row.correctIndex].key).toBe(level!.target.key);
      const targetCount = row.options.filter((card) => card.key === level!.target.key).length;
      expect(targetCount).toBe(1);
    }
  });

  it("never repeats a distractor within the same row when the pool is large enough", () => {
    const level = buildLevel(CARDS);
    for (const row of level!.rows) {
      const keys = row.options.map((card) => card.key);
      expect(new Set(keys).size).toBe(3);
    }
  });

  it("degrades gracefully (samples with replacement) when the pool is thinner than 3 cards", () => {
    const thin = CARDS.slice(0, 2);
    const level = buildLevel(thin);
    expect(level).not.toBeNull();
    expect(level!.rows).toHaveLength(5);
    for (const row of level!.rows) {
      expect(row.options).toHaveLength(3);
      expect(row.options[row.correctIndex].key).toBe(level!.target.key);
    }
  });
});

const CONSONANT_POOL = ["Б", "В", "М", "Т"];

describe("buildLetterLevel", () => {
  it("returns null with no consonant or an empty pool", () => {
    expect(buildLetterLevel("", CONSONANT_POOL)).toBeNull();
    expect(buildLetterLevel("М", [])).toBeNull();
  });

  it("targets the given consonant, with the other 2 options drawn from the pool", () => {
    const level = buildLetterLevel("М", CONSONANT_POOL);
    expect(level).not.toBeNull();
    expect(level!.target.key).toBe("М");
    expect(level!.rows).toHaveLength(5);
    for (const row of level!.rows) {
      expect(row.options[row.correctIndex].key).toBe("М");
      const keys = row.options.map((card) => card.key);
      expect(new Set(keys).size).toBe(3);
      for (const key of keys) expect(CONSONANT_POOL).toContain(key);
    }
  });
});

describe("buildSyllableLevel", () => {
  it("returns null with no consonant chosen yet", () => {
    expect(buildSyllableLevel("")).toBeNull();
  });

  it("builds open (consonant+vowel) syllables of the given consonant", () => {
    const level = buildSyllableLevel("м");
    expect(level).not.toBeNull();
    expect(level!.target.key).toMatch(/^М[аоуеиі]$/);
    for (const row of level!.rows) {
      const keys = row.options.map((card) => card.key);
      for (const key of keys) expect(key).toMatch(/^М[аоуеиі]$/);
      expect(new Set(keys).size).toBe(3);
      expect(row.options[row.correctIndex].key).toBe(level!.target.key);
    }
  });
});
