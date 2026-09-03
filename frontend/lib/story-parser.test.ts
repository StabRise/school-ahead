import { describe, expect, it } from "vitest";
import { parseStory, parseStoryParagraph, parseStoryTitle, type StoryWordSegment } from "./story-parser";

const text = (value: string): StoryWordSegment => ({ kind: "text", text: value });
const img = (number: number): StoryWordSegment => ({ kind: "image", number });

describe("parseStoryParagraph", () => {
  it("splits plain text around a syllable-word group, trimming each segment", () => {
    const { parts } = parseStoryParagraph("Щоранку {ві - н} виходив зі своєї хатинки.");
    expect(parts).toEqual([
      { kind: "text", text: "Щоранку " },
      { kind: "word", segments: [text("ві"), text("н")] },
      { kind: "text", text: " виходив зі своєї хатинки." },
    ]);
  });

  it("handles a group with more than two segments", () => {
    const { parts } = parseStoryParagraph("великим деревом {К - ВІ - Т - КА}");
    expect(parts).toEqual([
      { kind: "text", text: "великим деревом " },
      { kind: "word", segments: [text("К"), text("ВІ"), text("Т"), text("КА")] },
    ]);
  });

  it("returns a single text part for a paragraph with no syllable groups", () => {
    expect(parseStoryParagraph("Яка гарна квітка!")).toEqual({
      parts: [{ kind: "text", text: "Яка гарна квітка!" }],
    });
  });

  it("splits plain text around a standalone [Image #N] reference", () => {
    const { parts } = parseStoryParagraph("Щоранку [Image #25] виходив із хатинки.");
    expect(parts).toEqual([
      { kind: "text", text: "Щоранку " },
      { kind: "image", number: 25 },
      { kind: "text", text: " виходив із хатинки." },
    ]);
  });

  it("recognizes a standalone [Image #N] regardless of casing or spacing around the number", () => {
    expect(parseStoryParagraph("[image25]").parts).toEqual([{ kind: "image", number: 25 }]);
    expect(parseStoryParagraph("[IMAGE # 3]").parts).toEqual([{ kind: "image", number: 3 }]);
  });

  it("keeps syllable groups and image references in their original order", () => {
    const { parts } = parseStoryParagraph("{ві - н} бачить [Image #7] і {К - А - Т}.");
    expect(parts).toEqual([
      { kind: "word", segments: [text("ві"), text("н")] },
      { kind: "text", text: " бачить " },
      { kind: "image", number: 7 },
      { kind: "text", text: " і " },
      { kind: "word", segments: [text("К"), text("А"), text("Т")] },
      { kind: "text", text: "." },
    ]);
  });

  it("treats a word-breakdown segment written as [Image #N] as its own card image, not text", () => {
    const { parts } = parseStoryParagraph("{К - [Image #30] - Т - КА}");
    expect(parts).toEqual([
      { kind: "word", segments: [text("К"), img(30), text("Т"), text("КА")] },
    ]);
  });
});

describe("parseStory", () => {
  it("takes the first heading line as the title and splits the rest into paragraphs", () => {
    const story = parseStory(
      [
        "# 🐰 Зайчик і чарівний ліс",
        "",
        "Жив собі маленький зайчик на ім'я Тимко.",
        "",
        "Одного дня він побачив {К - ВІ - Т - КА}",
        "",
      ].join("\n"),
    );
    expect(story.title).toBe("🐰 Зайчик і чарівний ліс");
    expect(story.paragraphs).toHaveLength(2);
    expect(story.paragraphs[1].parts).toEqual([
      { kind: "text", text: "Одного дня він побачив " },
      { kind: "word", segments: [text("К"), text("ВІ"), text("Т"), text("КА")] },
    ]);
  });

  it("has no title when the file doesn't start with a heading", () => {
    const story = parseStory("Просто текст без заголовка.");
    expect(story.title).toBe("");
    expect(story.paragraphs).toEqual([{ parts: [{ kind: "text", text: "Просто текст без заголовка." }] }]);
  });

  it("prefers a lower heading level as the title, keeping a higher-level leading heading as the subtitle", () => {
    const story = parseStory(
      ["### Українська народна казка в обробці Івана Франка", " ", "# Ріпка", "", "Був собі дід."].join("\n"),
    );
    expect(story.title).toBe("Ріпка");
    expect(story.subtitle).toBe("Українська народна казка в обробці Івана Франка");
    expect(story.paragraphs).toEqual([{ parts: [{ kind: "text", text: "Був собі дід." }] }]);
  });
});

describe("parseStoryTitle", () => {
  it("returns just the title", () => {
    expect(parseStoryTitle("# Назва\n\nТекст.")).toBe("Назва");
  });
});
