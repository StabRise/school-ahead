"use client";

import { useEffect } from "react";
import { useMe } from "@/lib/api/browser/auth/auth";
import { useAuthStore } from "@/stores/auth-store";
import { mapApiUserToAuthUser } from "@/lib/api/map-user";

// Hydrates useAuthStore from GET /api/auth/me on load — see
// docs/architecture/06-frontend-architecture.md's Zustand store boundaries.
// A 401 (no/expired session) just clears the store rather than surfacing an
// error — an anonymous visitor is an expected state, not a failure.
export function useHydrateAuthStore() {
  const setUser = useAuthStore((state) => state.setUser);
  const clear = useAuthStore((state) => state.clear);
  const { data, isError } = useMe();

  useEffect(() => {
    if (data) {
      setUser(mapApiUserToAuthUser(data.user));
    } else if (isError) {
      clear();
    }
  }, [data, isError, setUser, clear]);
}
