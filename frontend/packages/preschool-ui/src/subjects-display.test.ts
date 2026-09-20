import { describe, expect, it } from "vitest";
import { groupsForDisplay, subjectsForDisplay, unmarkedGroupIdsOf } from "./subjects-display";

const subjects = [
  { id: 1, group_id: 10, is_marked: true },
  { id: 2, group_id: 10, is_marked: false },
  { id: 3, group_id: 20, is_marked: true },
  { id: 4, group_id: null, is_marked: false },
  { id: 5, group_id: null, is_marked: true },
];
const groups = [
  { id: 10, is_marked: true },
  { id: 20, is_marked: false },
  { id: 30, is_marked: true },
];
const ids = (list: { id: number }[]) => list.map((item) => item.id);
const options = (favoriteIds: number[] = []) => ({
  favoriteIds: new Set(favoriteIds),
  unmarkedGroupIds: unmarkedGroupIdsOf(groups),
});

describe("subjectsForDisplay", () => {
  it("marked: only marked subjects, and only in a marked category (or none)", () => {
    // 2 isn't marked; 3 is, but its category 20 isn't, so it is hidden with the
    // rest of that category; 4 isn't marked; 5 has no category.
    expect(ids(subjectsForDisplay("marked", subjects, options([2])))).toEqual([1, 5]);
  });

  it("marked: an unmarked category hides every subject in it", () => {
    const inUnmarked = [
      { id: 6, group_id: 20, is_marked: true },
      { id: 7, group_id: 20, is_marked: true },
    ];
    expect(subjectsForDisplay("marked", inUnmarked, options())).toEqual([]);
  });

  it("marked: nothing is hidden by a category that isn't known (yet)", () => {
    const noGroupsKnown = { favoriteIds: new Set<number>(), unmarkedGroupIds: new Set<number>() };
    expect(ids(subjectsForDisplay("marked", subjects, noGroupsKnown))).toEqual([1, 3, 5]);
  });

  it("all: every subject, marked or not, in any category", () => {
    expect(ids(subjectsForDisplay("all", subjects, options()))).toEqual([1, 2, 3, 4, 5]);
  });

  it("favorites: only the subjects the student hearted, whatever their marks", () => {
    expect(ids(subjectsForDisplay("favorites", subjects, options([2, 3, 4])))).toEqual([2, 3, 4]);
    expect(subjectsForDisplay("favorites", subjects, options())).toEqual([]);
  });

  it("marked: a subject without the flag (a payload that has none) is not marked", () => {
    expect(subjectsForDisplay("marked", [{ id: 1 }], options())).toEqual([]);
  });
});

describe("groupsForDisplay", () => {
  it("all: the categories that have a subject", () => {
    expect(ids(groupsForDisplay("all", groups, subjects))).toEqual([10, 20]);
  });

  it("marked: only the categories a tutor marked, and only those with a shown subject", () => {
    const shown = subjectsForDisplay("marked", subjects, options());
    // 20 isn't marked (so its subjects are already gone); 30 is marked but has no subject.
    expect(ids(groupsForDisplay("marked", groups, shown))).toEqual([10]);
  });

  it("favorites: the categories the hearted subjects belong to, marked or not", () => {
    const shown = subjectsForDisplay("favorites", subjects, options([3]));
    expect(ids(groupsForDisplay("favorites", groups, shown))).toEqual([20]);
  });

  it("offers nothing when no subject is shown", () => {
    expect(groupsForDisplay("all", groups, [])).toEqual([]);
  });
});
