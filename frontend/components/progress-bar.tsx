// Shared completion progress bar — same visual language as the calendar's
// weekly progress indicator (frontend/components/calendar/weekly-calendar.tsx),
// reused for the Subject/Topic detail pages (docs/interfaces/student/subjects.md).
// `compact` renders a thinner track with no label row — used by the
// Simple-view rows (subjects list, subject detail) that put the percent
// inline next to the bar instead of stacked above it.
export function ProgressBar({
  percent,
  label,
  compact,
}: {
  percent: number;
  label?: string;
  compact?: boolean;
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
      <div className={`w-full overflow-hidden rounded-full bg-gray-100 ${compact ? "h-1.5" : "h-2"}`}>
        <div className="h-full rounded-full bg-gray-900" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
