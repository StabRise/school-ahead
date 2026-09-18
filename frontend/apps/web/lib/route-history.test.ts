import { describe, expect, it } from "vitest";
import { getPreviousRoute, recordRoute } from "./route-history";

function fakeStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("route history", () => {
  it("knows nothing before a second route has been visited", () => {
    const store = fakeStore();
    expect(getPreviousRoute(store)).toBeNull();
    recordRoute("/", store);
    expect(getPreviousRoute(store)).toBeNull();
  });

  it("remembers the route that was left", () => {
    const store = fakeStore();
    recordRoute("/", store);
    recordRoute("/lessons/5", store);
    expect(getPreviousRoute(store)).toBe("/");
    recordRoute("/subjects/3", store);
    expect(getPreviousRoute(store)).toBe("/lessons/5");
  });

  it("keeps 'previous' when the same route is recorded again (reload, query change)", () => {
    const store = fakeStore();
    recordRoute("/", store);
    recordRoute("/lessons/5", store);
    recordRoute("/lessons/5", store);
    expect(getPreviousRoute(store)).toBe("/");
  });
});
