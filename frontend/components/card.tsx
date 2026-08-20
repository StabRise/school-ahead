"use client";

import { Link } from "@/i18n/navigation";

// Generic bordered card — renders as a hoverable/focusable Link when `href`
// is given, or a plain container otherwise. Shared by any list of clickable
// or static rows (lesson rows, subject cards, ...).
export function Card({
  children,
  href,
  className = "",
}: {
  children: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const classes = [
    "rounded-md border border-gray-200 px-4 py-3",
    href && "block hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return <div className={classes}>{children}</div>;
}
