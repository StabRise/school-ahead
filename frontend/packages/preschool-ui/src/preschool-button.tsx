"use client";

import Link from "next/link";
import type { ReactNode } from "react";

// Where a fixed PreschoolButton pins itself — the corner a child's eye
// intuitively goes to first, always the same spot regardless of what's
// scrolled/open underneath. "static" opts out of fixed positioning
// entirely, for a button meant to sit inline in normal flow instead.
export type PreschoolButtonPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "static";

const POSITION_CLASSES: Record<PreschoolButtonPosition, string> = {
  "top-left": "fixed left-4 top-4",
  "top-right": "fixed right-4 top-4",
  "bottom-left": "fixed bottom-4 left-4",
  "bottom-right": "fixed bottom-4 right-4",
  static: "",
};

interface PreschoolButtonBaseProps {
  // An emoji, SVG, or any other small piece of content — sized by the
  // button's own font-size/flex-centering, not the icon itself.
  icon: ReactNode;
  label: string;
  // A Tailwind `ring-*` color utility (e.g. "ring-emerald-400") for the
  // thick bright outline every preschool button gets — see
  // docs/interfaces (round, bold-colored border is the whole point: a
  // young child needs a big obvious target, not a subtle affordance).
  ringColorClassName?: string;
  // Tailwind `h-*/w-*` sizing, e.g. "h-14 w-14".
  sizeClassName?: string;
  position?: PreschoolButtonPosition;
  // Escape hatch for one-off positioning tweaks (e.g. a fixed button that
  // needs a different corner offset than the presets above) or a z-index
  // override — appended after everything else, so it always wins.
  className?: string;
  // Fires on every activation (click/tap) regardless of href vs onClick
  // below — e.g. a caller-chosen sound effect. Doesn't block or delay
  // navigation when `href` is set.
  onActivate?: () => void;
}

// action is either "navigate there" or "run this" — never both, same
// pattern as the games' BackToGamesButton this generalizes.
type PreschoolButtonAction = { href: string; onClick?: never } | { href?: never; onClick: () => void };

export type PreschoolButtonProps = PreschoolButtonBaseProps & PreschoolButtonAction;

// The one "cute button" building block behind every big, round,
// thick-bordered, bouncy-on-hover control a preschool screen needs (a home
// button, say) — see globals.css's `.preschool-button` class for the
// hop/scale feel itself, kept as plain CSS there so every consumer shares
// it with nothing to keep in sync.
export function PreschoolButton({
  icon,
  label,
  ringColorClassName = "ring-emerald-400",
  sizeClassName = "h-14 w-14",
  position = "top-left",
  className = "",
  onActivate,
  href,
  onClick,
}: PreschoolButtonProps) {
  const sharedClassName = `preschool-button z-30 flex ${sizeClassName} cursor-pointer items-center justify-center rounded-full bg-white text-3xl shadow-lg ring-4 ${ringColorClassName} ${POSITION_CLASSES[position]} ${className}`;

  if (href) {
    return (
      <Link href={href} aria-label={label} onClick={onActivate} className={sharedClassName}>
        {icon}
      </Link>
    );
  }
  // TS can't correlate `href`/`onClick` back to the union after they've
  // been destructured separately — the `href` return above guarantees
  // `onClick` is defined here.
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        onActivate?.();
        onClick?.();
      }}
      className={sharedClassName}
    >
      {icon}
    </button>
  );
}
