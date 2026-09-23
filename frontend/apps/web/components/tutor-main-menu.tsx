"use client";

import { GroupedNavMenu, type MenuEntry } from "@/components/grouped-nav-menu";

const TUTOR_MENU: MenuEntry[] = [
  { href: "/", labelKey: "tutorDashboard" },
  { href: "/tutor/subjects", labelKey: "mySubjects" },
  { href: "/tutor/classes", labelKey: "myClasses" },
  {
    labelKey: "avatarMenu",
    items: [
      { href: "/tutor/avatars", labelKey: "avatarEditor" },
      { href: "/tutor/furniture", labelKey: "furnitureEditor" },
    ],
  },
  {
    labelKey: "games",
    items: [
      { href: "/games", labelKey: "allGames" },
      { href: "/tutor/stories", labelKey: "storiesEditor" },
      { href: "/tutor/syllables", labelKey: "syllablesEditor" },
    ],
  },
];

export function TutorMainMenu() {
  return <GroupedNavMenu entries={TUTOR_MENU} />;
}
