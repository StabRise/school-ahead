import { describe, expect, it } from "vitest";
import {
  charBeforeCursor,
  detectCardGroup,
  isAtLineStart,
  prefixLines,
  serializeContainer,
  splitIntoSegments,
  unformatCardText,
} from "./story-rich-text";

describe("splitIntoSegments", () => {
  it("extracts an image card between surrounding text", () => {
    expect(splitIntoSegments("Привіт { https://example.com/a.png } світ")).toEqual([
      { type: "text", text: "Привіт " },
      { type: "image", url: "https://example.com/a.png" },
      { type: "text", text: " світ" },
    ]);
  });

  it("leaves non-image card groups (audio, syllables) as plain text", () => {
    const value = "{ дід } слухай { koza.mp3 }";
    expect(splitIntoSegments(value)).toEqual([{ type: "text", text: value }]);
  });

  it("returns a single text segment for content with no image cards", () => {
    expect(splitIntoSegments("просто текст")).toEqual([{ type: "text", text: "просто текст" }]);
  });
});

describe("serializeContainer", () => {
  function chip(url: string): HTMLElement {
    const span = document.createElement("span");
    span.dataset.imageUrl = url;
    return span;
  }

  it("turns an image chip back into its { url } text", () => {
    const container = document.createElement("div");
    container.appendChild(document.createTextNode("Привіт "));
    container.appendChild(chip("https://example.com/a.png"));
    container.appendChild(document.createTextNode(" світ"));

    expect(serializeContainer(container)).toBe("Привіт { https://example.com/a.png } світ");
  });

  it("turns a <br> into a newline", () => {
    const container = document.createElement("div");
    container.appendChild(document.createTextNode("рядок 1"));
    container.appendChild(document.createElement("br"));
    container.appendChild(document.createTextNode("рядок 2"));

    expect(serializeContainer(container)).toBe("рядок 1\nрядок 2");
  });
});

describe("detectCardGroup", () => {
  it("matches a selection that is exactly one { ... } group", () => {
    expect(detectCardGroup("{ш-та-н-ці}")).toBe("ш-та-н-ці");
  });

  it("returns null for plain text or a partial selection", () => {
    expect(detectCardGroup("штанці")).toBeNull();
    expect(detectCardGroup("{ш-та-н-ці")).toBeNull();
    expect(detectCardGroup("ш-та-н-ці}")).toBeNull();
  });
});

describe("unformatCardText", () => {
  it("strips syllable-break dashes", () => {
    expect(unformatCardText("ш-та-н-ці")).toBe("штанці");
  });

  it("is a no-op for a card with no dashes", () => {
    expect(unformatCardText("koza.mp3")).toBe("koza.mp3");
  });
});

describe("charBeforeCursor / isAtLineStart", () => {
  it("is null right at the start of the container", () => {
    const container = document.createElement("div");
    const text = document.createTextNode("hello");
    container.appendChild(text);

    expect(charBeforeCursor(container, text, 0)).toBeNull();
    expect(isAtLineStart(container, text, 0)).toBe(true);
  });

  it("returns the preceding character mid-text", () => {
    const container = document.createElement("div");
    const text = document.createTextNode("hello");
    container.appendChild(text);

    expect(charBeforeCursor(container, text, 3)).toBe("l");
    expect(isAtLineStart(container, text, 3)).toBe(false);
  });

  it("treats a <br> right before the cursor as a newline (line start)", () => {
    const container = document.createElement("div");
    container.appendChild(document.createElement("br"));
    const text = document.createTextNode("рядок 2");
    container.appendChild(text);

    expect(charBeforeCursor(container, text, 0)).toBe("\n");
    expect(isAtLineStart(container, text, 0)).toBe(true);
  });

  it("treats a literal newline inside a preceding text node as line start", () => {
    const container = document.createElement("div");
    container.appendChild(document.createTextNode("line 1\n"));
    const text = document.createTextNode("line 2");
    container.appendChild(text);

    expect(isAtLineStart(container, text, 0)).toBe(true);
  });

  it("skips over an empty text node when walking backward", () => {
    const container = document.createElement("div");
    container.appendChild(document.createTextNode("line 1\n"));
    container.appendChild(document.createTextNode(""));
    const text = document.createTextNode("line 2");
    container.appendChild(text);

    expect(isAtLineStart(container, text, 0)).toBe(true);
  });
});

describe("prefixLines", () => {
  it("prefixes a single selected line, keeping the selected text", () => {
    expect(prefixLines("яблуко", "# ")).toBe("# яблуко");
    expect(prefixLines("яблуко", "- ")).toBe("- яблуко");
  });

  it("prefixes every line of a multi-line selection", () => {
    expect(prefixLines("рядок 1\nрядок 2", "- ")).toBe("- рядок 1\n- рядок 2");
  });

  it("inserts just the bare prefix for an empty (collapsed-cursor) selection", () => {
    expect(prefixLines("", "# ")).toBe("# ");
  });
});
