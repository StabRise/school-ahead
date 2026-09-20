// Which subjects and categories (subject groups) the preschool bookshelf
// shows — picked with the ⚙️ in its top-right corner and remembered on this
// device (subjects-display-store.ts):
//   "marked" (default) — only what a tutor marked (Subject.is_marked and
//                        SubjectGroup.is_marked): the tutor's own selection. A
//                        subject has to be marked itself *and* so does its
//                        category: an unmarked category hides all its subjects,
//                        marked or not. A subject with no category needs only
//                        its own mark.
//   "all"              — every subject of the student's class.
//   "favorites"        — only the subjects the student hearted on the subject
//                        page (FavoriteSubject).
export type SubjectsDisplayMode = "marked" | "all" | "favorites";

export const SUBJECTS_DISPLAY_MODES: SubjectsDisplayMode[] = ["marked", "all", "favorites"];

export const DEFAULT_SUBJECTS_DISPLAY_MODE: SubjectsDisplayMode = "marked";

export function subjectsForDisplay<S extends { id: number; group_id?: number | null; is_marked?: boolean }>(
  mode: SubjectsDisplayMode,
  subjects: S[],
  {
    favoriteIds,
    unmarkedGroupIds,
  }: {
    favoriteIds: ReadonlySet<number>;
    // The categories a tutor has NOT marked — the "marked" view hides their
    // subjects. Not the marked ones, so that while the categories are still
    // loading (or if they failed to) nothing is hidden by mistake.
    unmarkedGroupIds: ReadonlySet<number>;
  },
): S[] {
  switch (mode) {
    case "marked":
      return subjects.filter(
        (subject) =>
          subject.is_marked === true && (subject.group_id == null || !unmarkedGroupIds.has(subject.group_id)),
      );
    case "favorites":
      return subjects.filter((subject) => favoriteIds.has(subject.id));
    case "all":
      return subjects;
  }
}

export function unmarkedGroupIdsOf(groups: { id: number; is_marked: boolean }[]): Set<number> {
  return new Set(groups.filter((group) => !group.is_marked).map((group) => group.id));
}

// The category pills to offer, given the subjects that made the cut above. A
// category with none of them would be a dead end, so it isn't offered; on top
// of that, the "marked" view offers only the categories a tutor marked (their
// subjects are the only ones it shows anyway). The favourites view has no
// categories of its own to mark: it offers the ones its subjects belong to.
export function groupsForDisplay<G extends { id: number; is_marked: boolean }>(
  mode: SubjectsDisplayMode,
  groups: G[],
  shownSubjects: { group_id: number | null }[],
): G[] {
  const usedGroupIds = new Set(shownSubjects.map((subject) => subject.group_id));
  return groups.filter((group) => usedGroupIds.has(group.id) && (mode !== "marked" || group.is_marked));
}
