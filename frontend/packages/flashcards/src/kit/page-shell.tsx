import type { ReactNode } from "react";

// Duplicated from apps/web's components/page-container.tsx +
// components/simple/page-container.tsx (SimplePageContainer's fixed
// xl:max-w-7xl convention) — both are small, generic, and still needed by
// apps/web itself for its own non-flashcards pages, so they're copied here
// rather than moved. Full width (edge-to-edge padding only) through every
// breakpoint up to `lg`, then caps at xl:max-w-7xl and centers via auto
// margins from `xl` up.
export function PageShell({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8 xl:mx-auto xl:max-w-7xl">
      {title && <h2 className="mb-4 text-xl font-semibold">{title}</h2>}
      {children}
    </div>
  );
}
