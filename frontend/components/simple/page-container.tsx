import type { ReactNode } from "react";
import { PageContainer } from "@/components/page-container";

// Shared width/padding shell for every Simple-view content page (student
// and tutor) — fixes the convention at xl:max-w-7xl so call sites don't
// each have to remember to pass it, and a later width change only happens
// here. The Simple calendar keeps PageContainer's own default instead (its
// week-grid wants the extra room), so it doesn't use this.
export function SimplePageContainer({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <PageContainer title={title} maxWidthClassName="xl:max-w-7xl">
      {children}
    </PageContainer>
  );
}
