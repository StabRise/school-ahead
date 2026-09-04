import { defineRouting } from "next-intl/routing";

// `uk` is the only shipped locale today, but the routing/translation-key
// setup is in place from day one per docs/core/languages.md's
// i18n-readiness requirement.
export const routing = defineRouting({
  locales: ["uk"],
  defaultLocale: "uk",
});
