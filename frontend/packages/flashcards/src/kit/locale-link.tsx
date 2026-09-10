"use client";

import { usePathname } from "next/navigation";
import NextLink from "next/link";
import type { ComponentProps } from "react";

// This package has no access to apps/web's i18n/routing.ts config to build
// a real locale-aware Link the way "@/i18n/navigation" does there — same
// situation as preschool-games' src/kit/use-locale-aware-router.ts, just
// applied to a <Link> instead of router.push()/replace() (this feature's
// group/set tile grids and back links are declarative <Link href> JSX,
// where native anchor semantics — middle-click, hover-prefetch, "open in
// new tab" — matter, unlike preschool-games' arcade-style imperative
// navigation). Prepending the locale read off the *current* URL's first
// path segment sidesteps needing the app-level routing config.
export function LocaleLink({ href, ...props }: ComponentProps<typeof NextLink>) {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] ?? "";
  const prefixedHref = typeof href === "string" && locale ? `/${locale}${href}` : href;
  return <NextLink href={prefixedHref} {...props} />;
}
