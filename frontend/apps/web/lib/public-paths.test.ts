import { describe, expect, it } from "vitest";
import { isPublicPath, pathWithoutLocale } from "./public-paths";

describe("pathWithoutLocale", () => {
  it("strips a served locale", () => {
    expect(pathWithoutLocale("/uk/subjects")).toBe("/subjects");
  });

  it("leaves a locale-less path alone rather than eating its first segment", () => {
    expect(pathWithoutLocale("/games/cards")).toBe("/games/cards");
  });
});

describe("isPublicPath", () => {
  it.each(["/uk", "/uk/login", "/uk/about", "/uk/about/", "/about", "/uk/games", "/uk/games/stories/kolobok", "/games/cards"])("%s is public", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(["/uk/subjects", "/uk/subjects/", "/uk/subjects/141", "/uk/lessons/preview/7", "/subjects/141"])(
    "%s is public — the read-only catalogue",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each([
    "/uk/subjects/141/topics/3",
    "/uk/subjects/abc",
    "/uk/lessons/7",
    "/uk/lessons/preview",
    "/uk/lessons/preview/7/extra",
    "/uk/tutor/subjects",
    "/uk/calendar",
    "/uk/profile",
    "/uk/settings",
    "/uk/about/team",
  ])("%s stays behind the login", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});
