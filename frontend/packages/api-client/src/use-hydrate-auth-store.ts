"use client";

import { useEffect } from "react";
import { useMe } from "./browser/auth/auth";
import { useAuthStore } from "./auth-store";
import { mapApiUserToAuthUser } from "./map-user";

// Hydrates useAuthStore from GET /api/auth/me on load — see
// docs/architecture/06-frontend-architecture.md's Zustand store boundaries.
// A 401 (no/expired session) just clears the store rather than surfacing an
// error — an anonymous visitor is an expected state, not a failure.
// React Query's default is three retries with backoff (~7s) before a failed
// query reports an error. A 401 is a definite answer ("nobody is signed in"),
// not a hiccup, and the public screens wait on it before they render — so it
// isn't retried; a network error or a 5xx still is.
export function shouldRetryMe(failureCount: number, error: { response?: { status?: number } }): boolean {
  return error.response?.status !== 401 && failureCount < 3;
}

export function useHydrateAuthStore() {
  const setUser = useAuthStore((state) => state.setUser);
  const clear = useAuthStore((state) => state.clear);
  const { data, isError } = useMe({ query: { retry: shouldRetryMe } });

  useEffect(() => {
    if (data) {
      setUser(mapApiUserToAuthUser(data.user));
    } else if (isError) {
      clear();
    }
  }, [data, isError, setUser, clear]);
}
