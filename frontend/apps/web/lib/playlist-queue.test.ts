import { describe, expect, it } from "vitest";
import { nextAfterError, nextIndex, previousIndex } from "./playlist-queue";

describe("nextIndex", () => {
  it("moves on to the next song", () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(1, 3)).toBe(2);
  });

  it("is null after the last song", () => {
    expect(nextIndex(2, 3)).toBeNull();
    expect(nextIndex(0, 1)).toBeNull();
  });
});

describe("previousIndex", () => {
  it("moves back one song", () => {
    expect(previousIndex(2)).toBe(1);
  });

  it("stays on the first song", () => {
    expect(previousIndex(0)).toBe(0);
  });
});

describe("nextAfterError", () => {
  it("skips a song that can't be played", () => {
    expect(nextAfterError(0, 3, 1)).toBe(1);
  });

  it("stops at the end of the queue", () => {
    expect(nextAfterError(2, 3, 1)).toBeNull();
  });

  it("stops when every song in a row has failed, rather than looping", () => {
    expect(nextAfterError(1, 3, 3)).toBeNull();
    expect(nextAfterError(0, 1, 1)).toBeNull();
  });

  it("keeps skipping while some songs still may play", () => {
    expect(nextAfterError(0, 4, 2)).toBe(1);
  });
});
