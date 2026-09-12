import { describe, expect, it } from "vitest";
import { getYoutubeVideoId } from "./youtube";

describe("getYoutubeVideoId", () => {
  it("extracts the id from a watch URL", () => {
    expect(getYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("extracts the id from a watch URL with extra query params", () => {
    expect(
      getYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s&list=PL123"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("extracts the id from a youtu.be short URL", () => {
    expect(getYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts the id from an embed URL", () => {
    expect(getYoutubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts the id from a shorts URL", () => {
    expect(getYoutubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("works without the www prefix", () => {
    expect(getYoutubeVideoId("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for a non-YouTube URL", () => {
    expect(getYoutubeVideoId("https://example.com/video")).toBeNull();
  });

  it("returns null for an invalid URL", () => {
    expect(getYoutubeVideoId("not a url")).toBeNull();
  });

  it("returns null for the bare YouTube homepage", () => {
    expect(getYoutubeVideoId("https://www.youtube.com/")).toBeNull();
  });
});
