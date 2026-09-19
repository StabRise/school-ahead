"use client";

import { useAuthStore, useIsGuest } from "@school-ahead/api-client";
import { SimpleSubjectDetailPage } from "./simple-subject-detail-page";
import { PreschoolPublicSubjectDetailPage, PreschoolSubjectDetailPage } from "./preschool-subject-detail-page";

// Default and Simple share the same SimpleSubjectDetailPage — Default just
// turns `colorful` on. Preschool gets its own grid-of-cards screen instead
// (see subjects-shelf.tsx, which already links here for that mode). See
// the Settings page's "Вигляд" section (components/settings/view-settings.tsx).
//
// A visitor who isn't signed in gets the same preschool look, read-only, for
// the subjects of public classes — see docs/core/public_access.md. Nothing is
// rendered (or fetched) until we know which of the two they are, so a
// signed-in student never flashes the public page.
export function SubjectDetailPage({ subjectId }: { subjectId: number }) {
  const interfaceMode = useAuthStore((state) => state.user?.interfaceMode);
  const isResolved = useAuthStore((state) => state.isResolved);
  const isGuest = useIsGuest();

  if (!isResolved) {
    return null;
  }

  if (isGuest) {
    return <PreschoolPublicSubjectDetailPage subjectId={subjectId} />;
  }

  if (interfaceMode === "preschool") {
    return <PreschoolSubjectDetailPage subjectId={subjectId} />;
  }

  return <SimpleSubjectDetailPage subjectId={subjectId} colorful={interfaceMode !== "simple"} />;
}
