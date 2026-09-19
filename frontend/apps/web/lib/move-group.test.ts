import { describe, expect, it } from "vitest";
import { moveGroup } from "./move-group";

describe("moveGroup", () => {
  it("moves a group up, in front of the one it is dropped on", () => {
    expect(moveGroup([1, 2, 3, 4], 3, 1)).toEqual([3, 1, 2, 4]);
    expect(moveGroup([1, 2, 3, 4], 3, 2)).toEqual([1, 3, 2, 4]);
  });

  it("moves a group down, behind the one it is dropped on", () => {
    expect(moveGroup([1, 2, 3, 4], 1, 2)).toEqual([2, 1, 3, 4]);
    expect(moveGroup([1, 2, 3, 4], 1, 4)).toEqual([2, 3, 4, 1]);
  });

  it("sends a group to the end when dropped past the last one", () => {
    expect(moveGroup([1, 2, 3], 1, null)).toEqual([2, 3, 1]);
  });

  it("does nothing when dropped on itself or already last", () => {
    expect(moveGroup([1, 2, 3], 2, 2)).toBeNull();
    expect(moveGroup([1, 2, 3], 3, null)).toBeNull();
  });

  it("does nothing for an id that isn't in the list", () => {
    expect(moveGroup([1, 2, 3], 9, 1)).toBeNull();
    expect(moveGroup([1, 2, 3], 1, 9)).toBeNull();
  });

  it("does not change the list it is given", () => {
    const ids = [1, 2, 3];
    moveGroup(ids, 1, 3);
    expect(ids).toEqual([1, 2, 3]);
  });
});
