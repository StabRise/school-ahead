// The order a subject's ▶ player plays its songs in — see
// components/subjects/subject-player.tsx. Pure, so it can be tested without a
// player.

// The song after `current`, or null once the queue is over.
export function nextIndex(current: number, length: number): number | null {
  return current + 1 < length ? current + 1 : null;
}

// The song before `current`; on the first one it stays there (going "back"
// then plays it again from the start).
export function previousIndex(current: number): number {
  return Math.max(0, current - 1);
}

// Where to go when the song at `current` can't be played (YouTube refuses to
// embed it, it was removed, ...): on to the next one — unless the queue is over,
// or `failuresInARow` (this one included) has reached the length of the queue,
// meaning nothing plays and skipping on would never end. Null: stop.
export function nextAfterError(current: number, length: number, failuresInARow: number): number | null {
  if (failuresInARow >= length) return null;
  return nextIndex(current, length);
}
