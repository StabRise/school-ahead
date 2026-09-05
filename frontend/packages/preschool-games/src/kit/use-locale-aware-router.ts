"use client";

import { usePathname, useRouter } from "next/navigation";

// Every /games* route lives under the app's `[locale]` segment (see
// apps/web/i18n/routing.ts — always-prefixed, single "uk" locale today), but
// this package has no access to that app-level config to build a
// locale-aware router the way "@/i18n/navigation" does elsewhere in the app.
// A plain next/navigation push to an absolute, locale-less path (e.g.
// "/games/cards") drops the prefix — for a signed-in user this just costs an
// extra redirect round trip (intlMiddleware re-adds the prefix), but for an
// anonymous visitor it makes middleware.ts's isPublicPath() check fail (it
// treats the first path segment as the locale to strip off), which bounces
// them to a bogus "/games/login" page instead of letting them keep playing.
// Prepending the locale segment read off the *current* URL sidesteps that.
export function useLocaleAwareGamesRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split("/")[1] ?? "";
  const withLocale = (path: string) => (locale ? `/${locale}${path}` : path);

  return {
    push: (path: string) => router.push(withLocale(path)),
    replace: (path: string) => router.replace(withLocale(path)),
  };
}
