import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// next-intl's own middleware isn't what is under test: it just marks "let it through".
vi.mock("next-intl/middleware", () => ({ default: () => () => "passed-through" }));

import middleware from "./middleware";

// Only what the middleware reads of a request.
function request(pathname: string, { signedIn }: { signedIn: boolean }) {
  return {
    nextUrl: { pathname },
    url: `http://localhost:3000${pathname}`,
    cookies: { has: (name: string) => signedIn && name === "access_token" },
  } as unknown as NextRequest;
}

const run = (pathname: string, signedIn: boolean) => middleware(request(pathname, { signedIn }));
const redirectPath = (response: unknown) =>
  response instanceof Response ? new URL(response.headers.get("location") as string).pathname : null;

describe("middleware", () => {
  it.each(["/uk/calendar", "/uk/profile", "/uk/lessons/195", "/uk/subjects/141/topics/3", "/uk/tutor/classes"])(
    "sends a visitor who isn't signed in from %s to the home page",
    (path) => {
      expect(redirectPath(run(path, false))).toBe("/uk");
    },
  );

  it.each(["/uk", "/uk/about", "/uk/subjects", "/uk/subjects/141", "/uk/lessons/preview/7", "/uk/games", "/uk/games/stories/x"])(
    "lets a visitor who isn't signed in open %s",
    (path) => {
      expect(run(path, false)).toBe("passed-through");
    },
  );

  it("lets a signed-in user open the protected pages", () => {
    expect(run("/uk/calendar", true)).toBe("passed-through");
  });

  it.each([false, true])("sends /login — the page is gone — to the home page (signed in: %s)", (signedIn) => {
    expect(redirectPath(run("/uk/login", signedIn))).toBe("/uk");
    expect(redirectPath(run("/login", signedIn))).toBe("/uk");
  });
});
