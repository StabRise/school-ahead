import { describe, expect, it } from "vitest";
import { guestHomeKind, isPublicCataloguePage, preschoolHomeKind } from "./preschool-chrome";

describe("preschoolHomeKind", () => {
  it.each(["/subjects", "/calendar", "/profile", "/games"])("%s gets a 🏠 in the corner", (path) => {
    expect(preschoolHomeKind(path)).toBe("corner");
  });

  it.each(["/house", "/achievements", "/settings", "/dictionary"])("%s gets the strip", (path) => {
    expect(preschoolHomeKind(path)).toBe("strip");
  });

  it.each([
    "/",
    "/lessons",
    "/lessons/12",
    "/lessons/preview/12",
    "/subjects/7",
    "/subjects/7/topics/3",
    "/games/balloons",
    "/games/stories/kolobok",
  ])("%s has a way home of its own", (path) => {
    expect(preschoolHomeKind(path)).toBe("none");
  });
});

describe("the public catalogue for a visitor who isn't signed in", () => {
  it.each(["/subjects", "/subjects/2", "/subjects/141"])("%s has no site header", (path) => {
    expect(isPublicCataloguePage(path)).toBe(true);
  });

  it.each(["/", "/login", "/games", "/subjects/2/topics/3", "/subjects/abc", "/lessons/preview/7", "/calendar"])(
    "%s keeps the header",
    (path) => {
      expect(isPublicCataloguePage(path)).toBe(false);
    },
  );

  it("puts a 🏠 in the corner of the bookshelf; the subject page has its own", () => {
    expect(guestHomeKind("/subjects")).toBe("corner");
    expect(guestHomeKind("/subjects/2")).toBe("none");
    expect(guestHomeKind("/games")).toBe("none");
  });
});

