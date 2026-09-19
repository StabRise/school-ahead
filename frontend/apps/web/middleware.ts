import createMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { hasLocalePrefix, isPublicPath, pathWithoutLocale } from "./lib/public-paths";

const intlMiddleware = createMiddleware(routing);

// Everything is protected except the paths in lib/public-paths.ts (locale
// prefix stripped before comparing). This is a presence-only check on the
// access_token cookie for a fast redirect — NOT a substitute for real
// per-request auth, which CookieOrBearerJWTAuth enforces server-side on every
// Django call.
//
// Note: Next.js route groups like `(auth)`/`(student)` are stripped from the
// URL entirely, so this can't key off group names — it keys off actual
// public page paths instead. See docs/architecture/05-auth-flow.md.

export default function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const locale = (hasLocalePrefix(pathname) ? pathname.split("/")[1] : routing.defaultLocale) as string;
  const isAuthenticated = request.cookies.has("access_token");

  // An already-authenticated visitor hitting /login (stale bookmark, back
  // button after signing in, ...) should land in the app instead of seeing
  // the sign-in button again.
  if (pathWithoutLocale(pathname) === "/login" && isAuthenticated) {
    return Response.redirect(new URL(`/${locale}`, request.url));
  }

  if (!isPublicPath(pathname) && !isAuthenticated) {
    return Response.redirect(new URL(`/${locale}/login`, request.url));
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
