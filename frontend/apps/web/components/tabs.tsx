"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";

export interface TabItem {
  value: string;
  label: string;
  content: React.ReactNode;
  // When set, the tab renders as a link to its own route instead of just
  // flipping local state — see the tutor student overview page, where each
  // tab (today / calendar / stats) is a real sub-route so it's directly
  // linkable and shareable, not just a client-side toggle.
  href?: string;
}

const tabClassName = (isActive: boolean) =>
  `-mb-px border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
    isActive ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-900"
  }`;

// Hand-rolled tab strip — no @radix-ui/react-tabs dependency installed, and
// this is simple enough (single active panel, no keyboard-arrow nav) not to
// warrant adding one. Used by the Subject detail page's Overview / Resources
// / Topics split (docs/interfaces/student/subjects.md), and in link mode by
// the tutor student overview page (docs/interfaces/tutor/main.md).
//
// Uncontrolled by default (own `active` state, starting at `defaultValue`).
// Pass `value` to control which tab is active from outside — required when
// any tab has an `href` (the route itself decides which panel is open
// rather than in-page clicks), and also usable with plain (non-`href`)
// tabs by pairing it with `onValueChange` — e.g. the Subject detail pages'
// `?tab=...` sync (lib/use-tab-query-param.ts) — so a click both flips the
// active panel and lets the caller mirror it into the URL.
export function Tabs({
  tabs,
  defaultValue,
  value,
  onValueChange,
}: {
  tabs: TabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const [uncontrolledActive, setUncontrolledActive] = useState(defaultValue ?? tabs[0]?.value);
  const active = value ?? uncontrolledActive;
  const activeTab = tabs.find((tab) => tab.value === active) ?? tabs[0];

  const selectTab = (next: string) => {
    if (onValueChange) onValueChange(next);
    else setUncontrolledActive(next);
  };

  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => {
          const isActive = tab.value === activeTab?.value;
          return tab.href ? (
            <Link key={tab.value} href={tab.href} role="tab" aria-selected={isActive} className={tabClassName(isActive)}>
              {tab.label}
            </Link>
          ) : (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(tab.value)}
              className={tabClassName(isActive)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="pt-4">
        {activeTab?.content}
      </div>
    </div>
  );
}
