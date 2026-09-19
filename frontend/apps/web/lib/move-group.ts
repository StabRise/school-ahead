// The order the subject groups end up in after one is dragged onto another —
// `ids` is the current order, `draggedId` the group being moved and `targetId`
// the group it was dropped on (null: dropped past the last one, i.e. on the
// "ungrouped" section, which sends it to the end).
//
// The dragged group takes the target's place: dropped on one above it, it goes
// before it; on one below it, after it — so any position can be reached,
// including the last one, which "insert before the target" alone could not.
// Returns null when nothing would change (dropped on itself, already last, or
// an id that isn't in the list).
export function moveGroup(ids: number[], draggedId: number, targetId: number | null): number[] | null {
  const from = ids.indexOf(draggedId);
  if (from === -1) return null;

  const to = targetId === null ? ids.length - 1 : ids.indexOf(targetId);
  if (to === -1 || to === from) return null;

  const next = ids.filter((id) => id !== draggedId);
  next.splice(to, 0, draggedId);
  return next;
}
