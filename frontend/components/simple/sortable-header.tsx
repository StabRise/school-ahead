"use client";

import { useState } from "react";
import { ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";

export type SortDirection = "asc" | "desc";

// Click the active column to flip direction, click a different column to
// switch to it (always starting ascending) — shared by every Simple-view
// sortable table (dashboard lesson table, subjects list).
export function useSortState<K extends string>(initialKey: K, initialDirection: SortDirection = "asc") {
  const [sort, setSort] = useState<{ key: K; direction: SortDirection }>({
    key: initialKey,
    direction: initialDirection,
  });

  const toggleSort = (key: K) => {
    setSort((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" },
    );
  };

  return { sort, toggleSort };
}

export function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-left text-xs font-medium text-gray-500 hover:text-gray-700"
    >
      {label}
      {active ? (
        direction === "asc" ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        )
      ) : (
        <ArrowUpDown className="size-3 text-gray-300" />
      )}
    </button>
  );
}
