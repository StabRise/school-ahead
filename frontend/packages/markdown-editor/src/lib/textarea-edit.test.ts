import { describe, expect, it } from "vitest";
import { insertText, isAtLineStart, prefixLines, wrapSelection } from "./textarea-edit";

describe("wrapSelection", () => {
  it("wraps a selection and reselects the inner text", () => {
    const result = wrapSelection("hello world", 0, 5, "**");
    expect(result.value).toBe("**hello** world");
    expect(result.selectionStart).toBe(2);
    expect(result.selectionEnd).toBe(7);
  });

  it("inserts both markers with the cursor between them for an empty selection", () => {
    const result = wrapSelection("hello ", 6, 6, "**");
    expect(result.value).toBe("hello ****");
    expect(result.selectionStart).toBe(8);
    expect(result.selectionEnd).toBe(8);
  });

  it("supports different before/after markers", () => {
    const result = wrapSelection("text", 0, 4, "[", "](url)");
    expect(result.value).toBe("[text](url)");
  });
});

describe("insertText", () => {
  it("replaces the selection and collapses the cursor after the inserted text", () => {
    const result = insertText("hello world", 6, 11, "there");
    expect(result.value).toBe("hello there");
    expect(result.selectionStart).toBe(11);
    expect(result.selectionEnd).toBe(11);
  });
});

describe("isAtLineStart", () => {
  it("is true at the very start of the value", () => {
    expect(isAtLineStart("abc", 0)).toBe(true);
  });

  it("is true right after a newline", () => {
    expect(isAtLineStart("a\nb", 2)).toBe(true);
  });

  it("is false mid-line", () => {
    expect(isAtLineStart("abc", 1)).toBe(false);
  });
});

describe("prefixLines", () => {
  it("prefixes a single line touched by a mid-line selection", () => {
    const result = prefixLines("hello world", 2, 4, "# ");
    expect(result.value).toBe("# hello world");
  });

  it("prefixes every line in a multi-line selection and keeps the text", () => {
    const result = prefixLines("one\ntwo\nthree", 0, 13, "- ");
    expect(result.value).toBe("- one\n- two\n- three");
  });

  it("only prefixes the lines the selection touches, not the whole document", () => {
    const value = "first\nsecond\nthird";
    const result = prefixLines(value, 6, 12, "> ");
    expect(result.value).toBe("first\n> second\nthird");
  });

  it("inserts a bare prefix at the line start for a collapsed cursor", () => {
    const result = prefixLines("hello", 5, 5, "## ");
    expect(result.value).toBe("## hello");
  });
});
