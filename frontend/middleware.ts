import createMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Everything is protected except these paths (locale-prefix stripped before
// comparing). This is a presence-only check on the access_token cookie for a
// fast redirect — NOT a substitute for real per-request auth, which
// CookieOrBearerJWTAuth enforces server-side on every Django call.
//
// Note: Next.js route groups like `(auth)`/`(student)` are stripped from the
// URL entirely, so this can't key off group names — it keys off actual
// public page paths instead. See docs/architecture/05-auth-flow.md.
const PUBLIC_PATHS = ["/login"];

function isPublicPath(pathname: string): boolean {
  const withoutLocale = "/" + pathname.split("/").slice(2).join("/");
  return PUBLIC_PATHS.some(
    (path) => withoutLocale === path || withoutLocale === "/",
  );
}

export default function middleware(request: NextRequest) {
  if (
    !isPublicPath(request.nextUrl.pathname) &&
    !request.cookies.has("access_token")
  ) {
    const locale = request.nextUrl.pathname.split("/")[1] || routing.defaultLocale;
    return Response.redirect(new URL(`/${locale}/login`, request.url));
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
