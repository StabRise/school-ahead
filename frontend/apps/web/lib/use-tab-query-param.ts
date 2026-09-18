"use client";

import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";

// Keeps a page's active tab in sync with a `?tab=...` query param — the
// param is omitted entirely when it equals `defaultValue`, so the common
// case (landing on the first tab) keeps a clean URL — same pattern as
// LessonWizard's `?step=...`. Reloading or sharing the link lands back on
// the same tab instead of always resetting to the first one. Pass the
// result straight to Tabs' `value`/`onValueChange` (components/tabs.tsx).
// `paramName` defaults to `tab`; the student subjects list passes `group`
// (`/subjects?group=2`) for its per-SubjectGroup tabs.
export function useTabQueryParam(
  defaultValue: string,
  paramName = "tab",
): [string, (next: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get(paramName) ?? defaultValue;

  const setActiveTab = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === defaultValue) {
      params.delete(paramName);
    } else {
      params.set(paramName, next);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return [activeTab, setActiveTab];
}
