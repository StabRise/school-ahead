import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware Link/useRouter/usePathname/redirect — prefix the current
// locale automatically instead of relying on a middleware round-trip.
export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
