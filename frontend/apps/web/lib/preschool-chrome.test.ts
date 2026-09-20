import { describe, expect, it } from "vitest";
import { preschoolHomeKind } from "./preschool-chrome";

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
