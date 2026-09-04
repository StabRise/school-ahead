"use client";

import { useAuthStore } from "@school-ahead/api-client";
import { SimpleSubjectDetailPage } from "./simple-subject-detail-page";

// Default and Simple now share the same SimpleSubjectDetailPage — Default
// just turns `colorful` on. See the Settings page's "Вигляд" section
// (components/settings/view-settings.tsx).
export function SubjectDetailPage({ subjectId }: { subjectId: number }) {
  const isSimple = useAuthStore((state) => state.user?.interfaceMode === "simple");
  return <SimpleSubjectDetailPage subjectId={subjectId} colorful={!isSimple} />;
}
