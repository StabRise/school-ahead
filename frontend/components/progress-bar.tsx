// Shared completion progress bar — same visual language as the calendar's
// weekly progress indicator (frontend/components/calendar/weekly-calendar.tsx),
// reused for the Subject/Topic detail pages (docs/interfaces/student/subjects.md).
export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div>
      {label && (
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
          <span>{label}</span>
          <span>{Math.round(clamped)}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-gray-900" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
