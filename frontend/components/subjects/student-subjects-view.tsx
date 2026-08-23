"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "@/i18n/navigation";
import { MySubjectsPage } from "./my-subjects-page";
import { PreschoolSubjectsShelf } from "@/components/preschool/subjects-shelf";

// This route is student-only — `GET /academics/my-subjects` 403s for any
// other role (it resolves the caller's own StudentProfile). A tutor landing
// here (e.g. a stale bookmark) gets bounced to their own subjects list
// instead of hitting that error. Both interface modes below share the same
// route/data — this just picks which experience renders it. See
// docs/views/preschool/README.md.
export function StudentSubjectsView() {
  const role = useAuthStore((state) => state.user?.role);
  const isPreschool = useAuthStore((state) => state.user?.interfaceMode === "preschool");
  const router = useRouter();

  useEffect(() => {
    if (role && role !== "student") {
      router.replace(role === "tutor" ? "/tutor/subjects" : "/");
    }
  }, [role, router]);

  if (role && role !== "student") {
    return null;
  }

  if (isPreschool) {
    return <PreschoolSubjectsShelf />;
  }
  return <MySubjectsPage />;
}
