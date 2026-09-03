"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "@/i18n/navigation";
import { SimpleSubjectsPage } from "./simple-subjects-page";
import { PreschoolSubjectsShelf } from "@/components/preschool/subjects-shelf";

// This route is student-only — `GET /academics/my-subjects` 403s for any
// other role (it resolves the caller's own StudentProfile). A tutor landing
// here (e.g. a stale bookmark) gets bounced to their own subjects list
// instead of hitting that error. All three interface modes below share the
// same route/data — this just picks which experience renders it. See
// docs/views/preschool/README.md and the Settings page's "Вигляд" section
// (components/settings/view-settings.tsx).
export function StudentSubjectsView() {
  const role = useAuthStore((state) => state.user?.role);
  const interfaceMode = useAuthStore((state) => state.user?.interfaceMode);
  const router = useRouter();

  useEffect(() => {
    if (role && role !== "student") {
      router.replace(role === "tutor" ? "/tutor/subjects" : "/");
    }
  }, [role, router]);

  if (role && role !== "student") {
    return null;
  }

  if (interfaceMode === "preschool") {
    return <PreschoolSubjectsShelf />;
  }
  return <SimpleSubjectsPage colorful={interfaceMode !== "simple"} />;
}
