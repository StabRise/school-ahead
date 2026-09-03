import { describe, expect, it } from "vitest";
import { parseStory, parseStoryTitle, parseSyllableGroup, type StoryWordSegment } from "./story-parser";

const text = (value: string): StoryWordSegment => ({ kind: "text", text: value });
const img = (filename: string): StoryWordSegment => ({ kind: "image", filename });

describe("parseSyllableGroup", () => {
  it("splits a syllable breakdown by '-', trimming each segment", () => {
    expect(parseSyllableGroup("ві - н")).toEqual([text("ві"), text("н")]);
  });

  it("handles a group with more than two segments", () => {
    expect(parseSyllableGroup("К - ВІ - Т - КА")).toEqual([text("К"), text("ВІ"), text("Т"), text("КА")]);
  });

  it("treats the whole group as one image card when its content is just an image filename", () => {
    expect(parseSyllableGroup(" img1.jpeg ")).toEqual([img("img1.jpeg")]);
  });

  it("recognizes an image filename regardless of extension casing, and allows a dash inside it", () => {
    expect(parseSyllableGroup("IMG1.JPEG")).toEqual([img("IMG1.JPEG")]);
    expect(parseSyllableGroup(" img-1.png ")).toEqual([img("img-1.png")]);
  });

  it("treats a word-breakdown segment written as an image filename as its own card image, not text", () => {
    expect(parseSyllableGroup("К - img1.jpeg - Т - КА")).toEqual([text("К"), img("img1.jpeg"), text("Т"), text("КА")]);
  });
});

describe("parseStory", () => {
  it("takes the first heading line as the title and keeps the rest as the body, unparsed", () => {
    const story = parseStory(
      ["# 🐰 Зайчик і чарівний ліс", "", "Жив собі маленький зайчик на ім'я Тимко.", "", "Другий абзац."].join("\n"),
    );
    expect(story.title).toBe("🐰 Зайчик і чарівний ліс");
    expect(story.subtitle).toBeUndefined();
    expect(story.body).toBe("Жив собі маленький зайчик на ім'я Тимко.\n\nДругий абзац.");
  });

  it("has no title when the file doesn't start with a heading", () => {
    const story = parseStory("Просто текст без заголовка.");
    expect(story.title).toBe("");
    expect(story.body).toBe("Просто текст без заголовка.");
  });

  it("prefers a lower heading level as the title, keeping a higher-level leading heading as the subtitle", () => {
    const story = parseStory(
      ["### Українська народна казка в обробці Івана Франка", " ", "# Ріпка", "", "Був собі дід."].join("\n"),
    );
    expect(story.title).toBe("Ріпка");
    expect(story.subtitle).toBe("Українська народна казка в обробці Івана Франка");
    expect(story.body).toBe("Був собі дід.");
  });
});

describe("parseStoryTitle", () => {
  it("returns just the title", () => {
    expect(parseStoryTitle("# Назва\n\nТекст.")).toBe("Назва");
  });
});
