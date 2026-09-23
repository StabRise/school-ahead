"use client";

import { GroupedNavMenu, type MenuEntry } from "@/components/grouped-nav-menu";

// "Ігри" (Games) lives on the header's right side, next to the Preschool
// Mode toggle (see header.tsx) — always visible, not just in preschool
// mode — so it isn't one of this left-side nav's items. Мій будинок is also
// in the avatar dropdown on the right (header.tsx).
const STUDENT_MENU: MenuEntry[] = [
  { href: "/", labelKey: "todayLessons" },
  { href: "/subjects", labelKey: "subjects" },
  { href: "/calendar", labelKey: "calendar" },
  { href: "/read-along", labelKey: "readAlong" },
  {
    labelKey: "utilsMenu",
    items: [
      { href: "/dictionary", labelKey: "dictionary" },
      { href: "/house", labelKey: "house" },
    ],
  },
];

export function MainMenu() {
  return <GroupedNavMenu entries={STUDENT_MENU} />;
}
