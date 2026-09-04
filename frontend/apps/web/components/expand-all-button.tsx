"use client";

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

// Icon-only expand/collapse-all toggle shared by the tutor's Subject detail
// page (TutorSubjectDetailPage) and the student's Course plan (CoursePlan) —
// same control, same two states, just wired to each page's own expanded-set.
export function ExpandAllButton({
  expanded,
  onToggle,
  disabled,
  expandLabel,
  collapseLabel,
}: {
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  expandLabel: string;
  collapseLabel: string;
}) {
  const label = expanded ? collapseLabel : expandLabel;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="shrink-0 rounded-md border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {expanded ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
    </button>
  );
}
