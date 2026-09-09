"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const MENU_ITEMS = [
  { href: "/", labelKey: "todayLessons" },
  { href: "/subjects", labelKey: "subjects" },
  { href: "/calendar", labelKey: "calendar" },
  { href: "/read-along", labelKey: "readAlong" },
  { href: "/dictionary", labelKey: "dictionary" },
  { href: "/house", labelKey: "house" },
] as const;

// "Ігри" (Games) lives on the header's right side now, next to the
// Preschool Mode toggle (see header.tsx) — always visible, not just in
// preschool mode — so it's no longer one of this left-side nav's items.
// Below `md` there isn't room for six items inline next to the brand and
// the header's right-side content, so this collapses into a ☰ dropdown
// (same Radix DropdownMenu the avatar menu on the right already uses,
// same "both markup blocks always in the DOM, Tailwind's `hidden`/`md:`
// pair decides which one paints" approach header.tsx already uses for
// PreschoolModeToggle) — `md:` and up renders the plain inline nav
// unchanged.
export function MainMenu() {
  const t = useTranslations("Header");
  const pathname = usePathname();

  return (
    <>
      <nav className="hidden items-center gap-4 md:flex">
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

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={t("mainMenu")}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 md:hidden"
          >
            <Menu className="size-5" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={8}
            className="z-50 min-w-48 rounded-md border border-gray-200 bg-white p-1 shadow-lg"
          >
            {MENU_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <DropdownMenu.Item key={item.href} asChild>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`block cursor-pointer rounded-sm px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100 ${
                      isActive ? "font-medium text-gray-900" : "text-gray-700"
                    }`}
                  >
                    {t(item.labelKey)}
                  </Link>
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
