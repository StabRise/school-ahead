"use client";

import { useEffect } from "react";
import { usePathname } from "@/i18n/navigation";
import { browserRouteStore, recordRoute } from "@/lib/route-history";

// Renders nothing; just feeds every route change into lib/route-history.ts so
// screens can ask where the user came from. Mounted once, in the root layout.
export function RouteTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const store = browserRouteStore();
    if (store) recordRoute(pathname, store);
  }, [pathname]);

  return null;
}
