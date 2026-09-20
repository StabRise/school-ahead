// The heart on a preschool favourite button — filled once marked. Shared by
// the lesson screen's heart (lesson-view.tsx) and the subject page's
// (preschool-subject-detail-page.tsx).
export function HeartIcon({ filled, className = "h-9 w-9" }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} text-rose-500`} aria-hidden="true">
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
