// Keeps only the first `limit` entries across a list of groups, in page
// order (group by group) — for windowed rendering of a sectioned list, where
// the budget is shared by the whole page rather than applied per section.
// Groups are kept (with an empty `entries`) once the budget runs out, so the
// caller decides whether to hide them; entry order and each entry's index
// within its own group are unchanged, since only a prefix is ever cut.
export function limitAcrossGroups<G extends { entries: unknown[] }>(groups: G[], limit: number): G[] {
  let remaining = Math.max(0, limit);
  return groups.map((group) => {
    const entries = group.entries.slice(0, remaining);
    remaining -= entries.length;
    return { ...group, entries };
  });
}
