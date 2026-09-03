import { describe, expect, it } from "vitest";
import { parseStory, parseStoryParagraph, parseStoryTitle, type StoryWordSegment } from "./story-parser";

const text = (value: string): StoryWordSegment => ({ kind: "text", text: value });
const img = (filename: string): StoryWordSegment => ({ kind: "image", filename });

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

  it("treats a whole {...} group as one image card when its content is just an image filename", () => {
    const { parts } = parseStoryParagraph("Тішиться дід. { img1.jpeg } Пішов він на город.");
    expect(parts).toEqual([
      { kind: "text", text: "Тішиться дід. " },
      { kind: "word", segments: [img("img1.jpeg")] },
      { kind: "text", text: " Пішов він на город." },
    ]);
  });

  it("recognizes an image filename regardless of extension casing, and allows a dash inside it", () => {
    expect(parseStoryParagraph("{IMG1.JPEG}").parts).toEqual([{ kind: "word", segments: [img("IMG1.JPEG")] }]);
    expect(parseStoryParagraph("{ img-1.png }").parts).toEqual([{ kind: "word", segments: [img("img-1.png")] }]);
  });

  it("treats a word-breakdown segment written as an image filename as its own card image, not text", () => {
    const { parts } = parseStoryParagraph("{К - img1.jpeg - Т - КА}");
    expect(parts).toEqual([{ kind: "word", segments: [text("К"), img("img1.jpeg"), text("Т"), text("КА")] }]);
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
