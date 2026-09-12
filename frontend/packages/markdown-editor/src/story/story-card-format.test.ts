import { describe, expect, it } from "vitest";
import { formatSelectionAsCards } from "./story-card-format";

describe("formatSelectionAsCards", () => {
  it("splits a single word into consonant+vowel/soft-sign card segments", () => {
    expect(formatSelectionAsCards("яблуко")).toBe("{я-б-лу-ко}");
    expect(formatSelectionAsCards("борщ")).toBe("{бо-р-щ}");
    expect(formatSelectionAsCards("молоко")).toBe("{мо-ло-ко}");
  });

  it("wraps each space-separated word in its own group and keeps whitespace", () => {
    expect(formatSelectionAsCards("чорна кішка")).toBe("{чо-р-на} {кі-ш-ка}");
  });
});
