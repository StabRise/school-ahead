// A student in preschool mode has no classic site header (components/header.tsx
// renders nothing for them). What replaces it depends on the page:
//   - "none": the page has a way home of its own — the dashboard (`/`) is home;
//     a lesson has its exit, the subject page its way back to the shelf, a game
//     its way back to the picker, and the road (`/lessons`) its own 🏠;
//   - "corner": a page with room for it gets a 🏠 fixed in the top-left corner,
//     out of the layout, so its heading stays where it is — the bookshelf, the
//     calendar, the game picker and the profile (their headings are centred, or
//     kept clear of the corner);
//   - "strip": any other page (the house, achievements, settings, ...) has
//     content that may start in that corner, so it gets a slim strip with the 🏠
//     above it, which pushes the page down but never covers anything.
// Either way there is always a 🏠 back to the dashboard. `pathname` is the
// locale-less one (i18n/navigation's usePathname).
export type PreschoolHomeKind = "none" | "corner" | "strip";

const NONE_PATTERNS = [/^\/$/, /^\/lessons(\/|$)/, /^\/subjects\/\d+/, /^\/games\/./];
const CORNER_PATTERNS = [/^\/subjects$/, /^\/calendar$/, /^\/profile$/, /^\/games$/];

export function preschoolHomeKind(pathname: string): PreschoolHomeKind {
  if (NONE_PATTERNS.some((pattern) => pattern.test(pathname))) return "none";
  if (CORNER_PATTERNS.some((pattern) => pattern.test(pathname))) return "corner";
  return "strip";
}

// A visitor who isn't signed in can browse the public catalogue — the bookshelf
// (`/subjects`) and one subject (`/subjects/<id>`), see docs/core/public_access.md
// — and there, too, has no classic site header: just a 🏠 to the root (`/`). The
// bookshelf gets it fixed in the top-left corner (its content is centred and clears
// the corner); the subject page has one of its own, in its header row, which goes
// back to the bookshelf — so the way home from a subject is subject → shelf → root.
export function isPublicCataloguePage(pathname: string): boolean {
  return /^\/subjects(\/\d+)?$/.test(pathname);
}

export function guestHomeKind(pathname: string): PreschoolHomeKind {
  return /^\/subjects$/.test(pathname) ? "corner" : "none";
}

