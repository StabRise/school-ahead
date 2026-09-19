"use client";

import { useEffect } from "react";
import { useAuthStore, useIsGuest } from "@school-ahead/api-client";
import { useRouter } from "@/i18n/navigation";
import { SimpleSubjectsPage } from "./simple-subjects-page";
import { PreschoolPublicSubjectsShelf, PreschoolSubjectsShelf } from "@school-ahead/preschool-ui";

// This route is student-only — `GET /academics/my-subjects` 403s for any
// other role (it resolves the caller's own StudentProfile). A tutor landing
// here (e.g. a stale bookmark) gets bounced to their own subjects list
// instead of hitting that error. All three interface modes below share the
// same route/data — this just picks which experience renders it. See
// docs/views/preschool/README.md and the Settings page's "Вигляд" section
// (components/settings/view-settings.tsx).
//
// A visitor who isn't signed in isn't bounced anywhere: this is one of the few
// public routes (see lib/public-paths.ts) and shows the same preschool
// bookshelf, filled with the subjects of every public class — see
// docs/core/public_access.md. Nothing renders until we know whether there is
// a session, so a signed-in student never flashes the public shelf.
export function StudentSubjectsView() {
  const role = useAuthStore((state) => state.user?.role);
  const interfaceMode = useAuthStore((state) => state.user?.interfaceMode);
  const isResolved = useAuthStore((state) => state.isResolved);
  const isGuest = useIsGuest();
  const router = useRouter();

  useEffect(() => {
    if (role && role !== "student") {
      router.replace(role === "tutor" ? "/tutor/subjects" : "/");
    }
  }, [role, router]);

  if (!isResolved || (role && role !== "student")) {
    return null;
  }

  if (isGuest) {
    return <PreschoolPublicSubjectsShelf />;
  }

  if (interfaceMode === "preschool") {
    return <PreschoolSubjectsShelf />;
  }
  return <SimpleSubjectsPage colorful={interfaceMode !== "simple"} />;
}
