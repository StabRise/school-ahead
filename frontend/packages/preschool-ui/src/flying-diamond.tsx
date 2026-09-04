"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Flies a 💎 (optionally labeled "+N" for a multi-diamond reward) from
// `from` (viewport coordinates, e.g. the button/badge that triggered the
// reward) to the header's DiamondBadge (components/header.tsx, marked with
// data-diamond-badge for this to find) — falling back to the top-right
// corner when the header isn't mounted (e.g. the fullscreen preschool
// lesson view, see Header's early return). Portaled to document.body so its
// `fixed` positioning escapes any ancestor's `overflow-hidden` and renders
// above the header it's flying into.
export function FlyingDiamond({
  from,
  amount,
  onDone,
}: {
  from: { x: number; y: number };
  // Shown as "+N" next to the diamond for a reward bigger than 1 (e.g. a
  // lesson completion that also finished its Topic/semester bonus).
  amount?: number;
  onDone: () => void;
}) {
  // Measured once via a lazy initializer (runs synchronously during the
  // first render, before paint) rather than in an effect, so there's no
  // in-between frame where the target isn't known yet.
  const [target] = useState(() => {
    const badgeRect = document.querySelector("[data-diamond-badge]")?.getBoundingClientRect();
    return badgeRect
      ? { x: badgeRect.left + badgeRect.width / 2, y: badgeRect.top + badgeRect.height / 2 }
      : { x: window.innerWidth - 32, y: 32 };
  });
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setFlying(true));
    // Fallback in case onTransitionEnd never fires (e.g. reduced-motion
    // settings drop the transition) so the diamond can't get stuck forever.
    const fallback = setTimeout(onDone, 1200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = flying ? target : from;
  return createPortal(
    <span
      aria-hidden="true"
      onTransitionEnd={onDone}
      className="pointer-events-none fixed top-0 left-0 z-50 flex items-center gap-0.5 text-3xl"
      style={{
        transform: `translate(${point.x - 16}px, ${point.y - 16}px) scale(${flying ? 0.4 : 1.4})`,
        opacity: flying ? 0.15 : 1,
        transition: "transform 0.9s cubic-bezier(0.3, 0, 0.6, 1), opacity 0.9s ease-in",
      }}
    >
      💎
      {amount != null && amount > 1 && (
        <span className="text-base font-extrabold text-cyan-700">+{amount}</span>
      )}
    </span>,
    document.body,
  );
}
