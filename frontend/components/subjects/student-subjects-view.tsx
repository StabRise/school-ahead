"use client";

import { useAuthStore } from "@/stores/auth-store";
import { MySubjectsPage } from "./my-subjects-page";
import { PreschoolSubjectsShelf } from "@/components/preschool/subjects-shelf";

// Both interface modes share the same route/data — this just picks which
// experience renders it. See docs/views/preschool/README.md.
export function StudentSubjectsView() {
  const isPreschool = useAuthStore((state) => state.user?.interfaceMode === "preschool");

  if (isPreschool) {
    return <PreschoolSubjectsShelf />;
  }
  return <MySubjectsPage />;
}
