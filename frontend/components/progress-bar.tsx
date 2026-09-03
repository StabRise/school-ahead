// Shared completion progress bar — same visual language as the calendar's
// weekly progress indicator (frontend/components/calendar/simple-calendar.tsx),
// reused for the Subject/Topic detail pages (docs/interfaces/student/subjects.md).

// Six-band color scale used by `colorful` — red for barely-started, through
// the rest of the spectrum, to violet once nearly done.
export function progressColorClass(percent: number): string {
  if (percent < 5) return "bg-red-500";
  if (percent < 25) return "bg-orange-500";
  if (percent < 50) return "bg-amber-500";
  if (percent < 75) return "bg-green-500";
  if (percent < 90) return "bg-blue-500";
  return "bg-violet-500";
}

// A single linear gradient spanning the whole 0-100% track, with a color
// stop at each band boundary above (using the same red/orange/amber/green/
// blue/violet-500 hex values) — so the fill blends smoothly from one band's
// color into the next as it grows, instead of snapping between flat colors.
const PROGRESS_GRADIENT =
  "linear-gradient(to right, #ef4444 0%, #f97316 5%, #f59e0b 25%, #22c55e 50%, #3b82f6 75%, #8b5cf6 90%, #8b5cf6 100%)";

// `compact` renders a thinner track with no label row — used by the
// Simple-view rows (subjects list, subject detail) that put the percent
// inline next to the bar instead of stacked above it. `colorful` swaps the
// flat black fill for the gradient above — used by the Default
// (non-Simple) dashboard, which reuses the Simple dashboard's components
// but keeps its original colorful look. The gradient is painted at full
// track width and then masked from the right, so the visible slice (0 to
// `percent`) always shows the correct colors instead of a stretched one.
export function ProgressBar({
  percent,
  label,
  compact,
  colorful,
}: {
  percent: number;
  label?: string;
  compact?: boolean;
  colorful?: boolean;
}) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div>
      {label && (
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
          <span>{label}</span>
          <span>{Math.round(clamped)}%</span>
        </div>
      )}
      <div className={`relative w-full overflow-hidden rounded-full bg-gray-100 ${compact ? "h-1.5" : "h-2"}`}>
        {colorful ? (
          <>
            <div className="absolute inset-0" style={{ backgroundImage: PROGRESS_GRADIENT }} />
            <div className="absolute inset-y-0 right-0 bg-gray-100" style={{ width: `${100 - clamped}%` }} />
          </>
        ) : (
          <div className="h-full rounded-full bg-gray-900" style={{ width: `${clamped}%` }} />
        )}
      </div>
    </div>
  );
}
