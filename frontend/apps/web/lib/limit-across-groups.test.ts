import { describe, expect, it } from "vitest";
import { limitAcrossGroups } from "./limit-across-groups";

const group = (key: string, count: number, from = 0) => ({
  key,
  entries: Array.from({ length: count }, (_, i) => from + i),
});

describe("limitAcrossGroups", () => {
  it("shares one budget across groups, in order", () => {
    const result = limitAcrossGroups([group("a", 3), group("b", 3, 10), group("c", 3, 20)], 5);
    expect(result.map((g) => g.entries)).toEqual([[0, 1, 2], [10, 11], []]);
  });

  it("keeps everything when the limit covers all entries", () => {
    const groups = [group("a", 2), group("b", 2, 10)];
    expect(limitAcrossGroups(groups, 20).map((g) => g.entries)).toEqual([[0, 1], [10, 11]]);
  });

  it("keeps groups (emptied) once the budget runs out, and their other fields", () => {
    const result = limitAcrossGroups([group("a", 2), group("b", 2, 10)], 2);
    expect(result).toEqual([{ key: "a", entries: [0, 1] }, { key: "b", entries: [] }]);
  });

  it("returns empty groups for a zero or negative limit", () => {
    expect(limitAcrossGroups([group("a", 2)], 0)[0].entries).toEqual([]);
    expect(limitAcrossGroups([group("a", 2)], -3)[0].entries).toEqual([]);
  });

  it("does not mutate its input", () => {
    const groups = [group("a", 3)];
    limitAcrossGroups(groups, 1);
    expect(groups[0].entries).toEqual([0, 1, 2]);
  });
});
