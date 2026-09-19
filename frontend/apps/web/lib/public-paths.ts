import { routing } from "@/i18n/routing";

// The pages a visitor who isn't signed in may open (locale prefix stripped
// before comparing). The middleware only checks that the access_token cookie
// is present — see middleware.ts, and docs/architecture/05-auth-flow.md.
//
// "/games" is every preschool minigame (@school-ahead/preschool-games),
// shared publicly, no login needed — anonymous visitors can play all five,
// they just don't earn diamonds (see useDiamondMilestoneReward, which
// no-ops the reward mutation when there's no signed-in student). Each
// game/story also gets its own nested public link (e.g.
// "/games/stories/<storySlug>"), hence the prefix match below rather than
// exact equality.
const PUBLIC_PREFIXES = ["/login", "/games"];

// The read-only public catalogue (docs/core/public_access.md): the bookshelf,
// one subject, one lesson. Exact patterns, not prefixes — the rest of
// /subjects/... (a topic page) and /lessons/... (a student's own lesson) stay
// behind the login. Which subjects and lessons actually exist for a visitor is
// decided by the API (Class.is_public), not here.
const PUBLIC_PATTERNS = [/^\/subjects\/?$/, /^\/subjects\/\d+\/?$/, /^\/lessons\/preview\/\d+\/?$/];

// The first segment is only a real locale when it's one next-intl actually
// serves — a client-side `router.push`/`Link href` built from a plain,
// locale-less absolute path (a mistake, but one that keeps recurring in the
// @school-ahead/preschool-games package — see its use-locale-aware-router.ts)
// arrives here with no locale segment at all, e.g. "/games/cards" rather
// than "/uk/games/cards". Blindly stripping segments[1] in that case would
// eat "games" itself, leaving `isPublicPath` checking the wrong, non-public
// remainder and wrongly bouncing an anonymous visitor to a login page whose
// path is `/games/login` (broken, and not even the real login route).
export function hasLocalePrefix(pathname: string): boolean {
  const [, maybeLocale] = pathname.split("/");
  return (routing.locales as readonly string[]).includes(maybeLocale ?? "");
}

export function pathWithoutLocale(pathname: string): string {
  const segments = pathname.split("/");
  const rest = hasLocalePrefix(pathname) ? segments.slice(2) : segments.slice(1);
  return "/" + rest.join("/");
}

export function isPublicPath(pathname: string): boolean {
  const withoutLocale = pathWithoutLocale(pathname);
  if (withoutLocale === "/") return true;
  if (PUBLIC_PATTERNS.some((pattern) => pattern.test(withoutLocale))) return true;
  return PUBLIC_PREFIXES.some((path) => withoutLocale === path || withoutLocale.startsWith(`${path}/`));
}
