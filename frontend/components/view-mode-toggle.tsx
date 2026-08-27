"use client";

import type { LucideIcon } from "lucide-react";

// Generic icon-only segmented control — shared by the tutor's Subject detail
// page (brief/full/student) and the student's Course plan (brief/full). Each
// caller supplies its own mode type, icons and labels; this just renders the
// buttons and highlights the active one.
export function ViewModeToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (mode: T) => void;
  options: { value: T; icon: LucideIcon; label: string }[];
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-gray-300 p-0.5">
      {options.map(({ value: mode, icon: Icon, label }) => {
        const isActive = value === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            aria-pressed={isActive}
            title={label}
            aria-label={label}
            className={`rounded p-1.5 ${isActive ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
