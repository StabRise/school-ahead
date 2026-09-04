"use client";

import { useState } from "react";

export interface TabItem {
  value: string;
  label: string;
  content: React.ReactNode;
}

// Hand-rolled tab strip — no @radix-ui/react-tabs dependency installed, and
// this is simple enough (single active panel, no keyboard-arrow nav) not to
// warrant adding one. Used by the Subject detail page's Overview / Resources
// / Topics split (docs/interfaces/student/subjects.md).
export function Tabs({ tabs, defaultValue }: { tabs: TabItem[]; defaultValue?: string }) {
  const [active, setActive] = useState(defaultValue ?? tabs[0]?.value);
  const activeTab = tabs.find((tab) => tab.value === active) ?? tabs[0];

  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => {
          const isActive = tab.value === activeTab?.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.value)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                isActive
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
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
