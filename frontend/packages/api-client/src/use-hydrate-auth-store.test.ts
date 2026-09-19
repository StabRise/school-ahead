import { describe, expect, it } from "vitest";
import { shouldRetryMe } from "./use-hydrate-auth-store";

describe("shouldRetryMe", () => {
  it("never retries a 401 — it means nobody is signed in", () => {
    expect(shouldRetryMe(0, { response: { status: 401 } })).toBe(false);
  });

  it("retries a network error (no response) a few times", () => {
    expect(shouldRetryMe(0, {})).toBe(true);
    expect(shouldRetryMe(2, {})).toBe(true);
    expect(shouldRetryMe(3, {})).toBe(false);
  });

  it("retries a server error", () => {
    expect(shouldRetryMe(1, { response: { status: 503 } })).toBe(true);
  });
});
