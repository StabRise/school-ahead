// Which subjects and categories (subject groups) the preschool bookshelf
// shows — picked with the ⚙️ in its top-right corner and remembered on this
// device (subjects-display-store.ts):
//   "marked" (default) — only what a tutor marked (Subject.is_marked and
//                        SubjectGroup.is_marked): the tutor's own selection.
//   "all"              — every subject of the student's class.
//   "favorites"        — only the subjects the student hearted on the subject
//                        page (FavoriteSubject).
export type SubjectsDisplayMode = "marked" | "all" | "favorites";

export const SUBJECTS_DISPLAY_MODES: SubjectsDisplayMode[] = ["marked", "all", "favorites"];

export const DEFAULT_SUBJECTS_DISPLAY_MODE: SubjectsDisplayMode = "marked";

export function subjectsForDisplay<S extends { id: number; is_marked?: boolean }>(
  mode: SubjectsDisplayMode,
  subjects: S[],
  favoriteIds: ReadonlySet<number>,
): S[] {
  switch (mode) {
    case "marked":
      return subjects.filter((subject) => subject.is_marked === true);
    case "favorites":
      return subjects.filter((subject) => favoriteIds.has(subject.id));
    case "all":
      return subjects;
  }
}

// The category pills to offer, given the subjects that made the cut above. A
// category with none of them would be a dead end, so it isn't offered; on top
// of that, the "marked" view offers only the categories a tutor marked — a
// marked subject in an unmarked category still shows, just under no filter.
// The favourites view has no categories of its own to mark: it offers the ones
// its subjects belong to.
export function groupsForDisplay<G extends { id: number; is_marked: boolean }>(
  mode: SubjectsDisplayMode,
  groups: G[],
  shownSubjects: { group_id: number | null }[],
): G[] {
  const usedGroupIds = new Set(shownSubjects.map((subject) => subject.group_id));
  return groups.filter((group) => usedGroupIds.has(group.id) && (mode !== "marked" || group.is_marked));
}
