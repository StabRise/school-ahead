"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const MENU_ITEMS = [
  { href: "/", labelKey: "tutorDashboard" },
  { href: "/tutor/subjects", labelKey: "mySubjects" },
] as const;

export function TutorMainMenu() {
  const t = useTranslations("Header");
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-4">
      {MENU_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-md text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              isActive ? "text-gray-900" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
