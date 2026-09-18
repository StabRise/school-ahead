"use client";

import { useAuthStore } from "@school-ahead/api-client";
import { SimpleSubjectDetailPage } from "./simple-subject-detail-page";
import { PreschoolSubjectDetailPage } from "./preschool-subject-detail-page";

// Default and Simple share the same SimpleSubjectDetailPage — Default just
// turns `colorful` on. Preschool gets its own grid-of-cards screen instead
// (see subjects-shelf.tsx, which already links here for that mode). See
// the Settings page's "Вигляд" section (components/settings/view-settings.tsx).
export function SubjectDetailPage({ subjectId }: { subjectId: number }) {
  const interfaceMode = useAuthStore((state) => state.user?.interfaceMode);

  if (interfaceMode === "preschool") {
    return <PreschoolSubjectDetailPage subjectId={subjectId} />;
  }

  return <SimpleSubjectDetailPage subjectId={subjectId} colorful={interfaceMode !== "simple"} />;
}
