"use client";

import { Link } from "@/i18n/navigation";

// Generic bordered card — renders as a hoverable/focusable Link when `href`
// is given, or a plain container otherwise. Shared by any list of clickable
// or static rows (lesson rows, subject cards, ...).
//
// `onClick` is for a card whose content also needs real nested <a>/<button>
// elements (e.g. a lesson row that navigates on click but also links its
// student/subject text out individually) — nesting those inside a real <a>
// (the `href` branch) would be invalid HTML, so this renders a plain,
// keyboard-operable div instead and lets the caller `stopPropagation()` on
// the nested elements' own clicks. Mutually exclusive with `href`.
export function Card({
  children,
  href,
  onClick,
  className = "",
  style,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  const classes = [
    "rounded-md border border-gray-200 px-4 py-3",
    (href || onClick) &&
      "block hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
    onClick && "cursor-pointer",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link href={href} className={classes} style={style}>
        {children}
      </Link>
    );
  }

  return (
    <div
      className={classes}
      style={style}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      role={onClick ? "link" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter") onClick();
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
