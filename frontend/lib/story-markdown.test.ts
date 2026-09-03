import { describe, expect, it } from "vitest";
import { extractStorySpeechRuns } from "./story-markdown";

describe("extractStorySpeechRuns", () => {
  it("returns each paragraph's plain text", () => {
    expect(extractStorySpeechRuns("Перше речення.\n\nДруге речення.")).toEqual([
      "Перше речення.",
      "Друге речення.",
    ]);
  });

  it("excludes a {...} card's raw content from the speakable text", () => {
    const runs = extractStorySpeechRuns("Щоранку {ві - н} виходив із хатинки.");
    expect(runs.join(" ")).not.toContain("ві - н");
    expect(runs.join(" ")).toContain("Щоранку");
    expect(runs.join(" ")).toContain("виходив із хатинки");
  });

  it("skips a paragraph that's only a {...} card", () => {
    expect(extractStorySpeechRuns("{ img1.jpeg }")).toEqual([]);
  });

  it("still returns text inside Markdown emphasis", () => {
    const runs = extractStorySpeechRuns("Це **важливе** слово.");
    expect(runs.join(" ")).toContain("важливе");
  });
});
