import { describe, expect, it } from "vitest";
import { groupsForDisplay, subjectsForDisplay } from "./subjects-display";

const subjects = [
  { id: 1, group_id: 10, is_marked: true },
  { id: 2, group_id: 10, is_marked: false },
  { id: 3, group_id: 20, is_marked: true },
  { id: 4, group_id: null, is_marked: false },
];
const groups = [
  { id: 10, is_marked: true },
  { id: 20, is_marked: false },
  { id: 30, is_marked: true },
];
const ids = (list: { id: number }[]) => list.map((item) => item.id);

describe("subjectsForDisplay", () => {
  it("marked: only the subjects a tutor marked", () => {
    expect(ids(subjectsForDisplay("marked", subjects, new Set([2])))).toEqual([1, 3]);
  });

  it("all: every subject, marked or not", () => {
    expect(ids(subjectsForDisplay("all", subjects, new Set()))).toEqual([1, 2, 3, 4]);
  });

  it("favorites: only the subjects the student hearted", () => {
    expect(ids(subjectsForDisplay("favorites", subjects, new Set([2, 4])))).toEqual([2, 4]);
    expect(subjectsForDisplay("favorites", subjects, new Set())).toEqual([]);
  });

  it("marked: a subject without the flag (the public shelf has none) is not marked", () => {
    expect(subjectsForDisplay("marked", [{ id: 1 }], new Set())).toEqual([]);
  });
});

describe("groupsForDisplay", () => {
  it("all: the categories that have a subject", () => {
    expect(ids(groupsForDisplay("all", groups, subjects))).toEqual([10, 20]);
  });

  it("marked: only the categories a tutor marked, and only those with a shown subject", () => {
    const shown = subjectsForDisplay("marked", subjects, new Set());
    // 20 has a marked subject but isn't marked itself; 30 is marked but has no subject.
    expect(ids(groupsForDisplay("marked", groups, shown))).toEqual([10]);
  });

  it("favorites: the categories the hearted subjects belong to, marked or not", () => {
    const shown = subjectsForDisplay("favorites", subjects, new Set([3]));
    expect(ids(groupsForDisplay("favorites", groups, shown))).toEqual([20]);
  });

  it("offers nothing when no subject is shown", () => {
    expect(groupsForDisplay("all", groups, [])).toEqual([]);
  });
});
