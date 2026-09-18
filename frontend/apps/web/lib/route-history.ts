// Remembers the previous in-app route, per browser tab (sessionStorage), so a
// screen can tell where the user came from. `document.referrer` can't do it:
// Next's client-side navigation never updates it. Fed by components/route-
// tracker.tsx; read by e.g. the preschool lesson screen's exit button (see
// lib/lesson-exit.ts). Routes are locale-less pathnames ("/", "/subjects/3"),
// as next-intl's usePathname returns them.
type RouteStore = Pick<Storage, "getItem" | "setItem">;

const CURRENT_KEY = "route-history:current";
const PREVIOUS_KEY = "route-history:previous";

export function recordRoute(pathname: string, store: RouteStore): void {
  const current = store.getItem(CURRENT_KEY);
  // The same route again — a reload, or only the query string changed — must
  // not overwrite "previous" with the very page we're on.
  if (current === pathname) return;
  if (current !== null) store.setItem(PREVIOUS_KEY, current);
  store.setItem(CURRENT_KEY, pathname);
}

export function getPreviousRoute(store: RouteStore): string | null {
  return store.getItem(PREVIOUS_KEY);
}

// sessionStorage is missing on the server and can throw in some private-
// browsing modes; callers just treat null as "unknown".
export function browserRouteStore(): RouteStore | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
