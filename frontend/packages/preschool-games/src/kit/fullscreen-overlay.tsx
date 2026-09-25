"use client";

import { useEffect } from "react";

// Shared full-screen chrome — a dark scrim that closes on tap anywhere
// (including the content itself, since nothing inside stops propagation),
// the ✕ button, Escape, or Space (a document-level listener rather than an
// onKeyDown on the div below, since nothing here auto-focuses that div on
// open — a keydown handler tied to its own focus would otherwise never
// fire from a plain mouse/tap click).
//
// Used by the "Казки" story cards (stories-game.tsx) and the "Слова" word
// row (words-game.tsx). `closeLabel` is the ✕ button's aria-label.
export function FullscreenOverlay({
  onClose,
  closeLabel,
  children,
}: {
  onClose: () => void;
  closeLabel: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== " ") return;
      e.preventDefault(); // Space would otherwise also scroll the page behind the overlay
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClose}
      className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/80 p-6"
    >
      {children}
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="absolute right-4 top-4 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white text-xl shadow-lg"
      >
        ✕
      </button>
    </div>
  );
}
