"use client";

import { Fragment } from "react";
import { Link } from "@/i18n/navigation";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

// Generic breadcrumb trail — the last item always renders as the current,
// non-interactive page; earlier items render as a link (`href`) or an
// in-page action (`onClick`) when given, otherwise as plain text.
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <Fragment key={index}>
            {index > 0 && (
              <span className="text-gray-300" aria-hidden="true">
                /
              </span>
            )}
            {isLast ? (
              <span className="font-medium text-gray-900" aria-current="page">
                {item.label}
              </span>
            ) : item.href ? (
              <Link
                href={item.href}
                className="text-gray-500 hover:text-gray-900 hover:underline"
              >
                {item.label}
              </Link>
            ) : item.onClick ? (
              <button
                type="button"
                onClick={item.onClick}
                className="text-gray-500 hover:text-gray-900 hover:underline"
              >
                {item.label}
              </button>
            ) : (
              <span className="text-gray-500">{item.label}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
