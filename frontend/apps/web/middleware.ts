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
//
// "/games" is every preschool minigame (@school-ahead/preschool-games),
// shared publicly, no login needed — anonymous visitors can play all five,
// they just don't earn diamonds (see useDiamondMilestoneReward, which
// no-ops the reward mutation when there's no signed-in student). Each
// game/story also gets its own nested public link (e.g.
// "/games/stories/<storySlug>"), hence the prefix match in isPublicPath
// below rather than exact equality.
const PUBLIC_PATHS = ["/login", "/games"];

function pathWithoutLocale(pathname: string): string {
  return "/" + pathname.split("/").slice(2).join("/");
}

function isPublicPath(pathname: string): boolean {
  const withoutLocale = pathWithoutLocale(pathname);
  if (withoutLocale === "/") return true;
  return PUBLIC_PATHS.some((path) => withoutLocale === path || withoutLocale.startsWith(`${path}/`));
}

export default function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const locale = pathname.split("/")[1] || routing.defaultLocale;
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
