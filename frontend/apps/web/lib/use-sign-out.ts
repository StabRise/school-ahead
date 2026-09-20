"use client";

import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, useLogout } from "@school-ahead/api-client/browser/auth/auth";
import { useAuthStore } from "@school-ahead/api-client";
import { useRouter } from "@/i18n/navigation";

// Signs the user out and goes to the home page (the landing page, once signed out): the server ends the session,
// then — whether or not that succeeded, so a failed request never leaves the
// screen looking signed in — the local user is forgotten and the cached `me`
// dropped. Shared by the classic header's menu and the preschool dashboard's
// waving-hand button.
export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const clearUser = useAuthStore((state) => state.clear);
  const logout = useLogout();

  const signOut = () => {
    if (logout.isPending) return;
    logout.mutate(undefined, {
      onSettled: () => {
        clearUser();
        queryClient.removeQueries({ queryKey: getMeQueryKey() });
        router.push("/");
      },
    });
  };

  return { signOut, isSigningOut: logout.isPending };
}
