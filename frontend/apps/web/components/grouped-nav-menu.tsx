"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export type MenuLink = { href: string; labelKey: string };
// A top-level entry is either a plain link or a named group that opens as
// a dropdown (Аватар, Ігри).
export type MenuEntry = MenuLink | { labelKey: string; items: MenuLink[] };

function isGroup(
  entry: MenuEntry,
): entry is { labelKey: string; items: MenuLink[] } {
  return "items" in entry;
}

const INLINE_LINK_CLASS =
  "rounded-md text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

function DropdownLink({
  item,
  isActive,
  label,
}: {
  item: MenuLink;
  isActive: boolean;
  label: string;
}) {
  return (
    <DropdownMenu.Item asChild>
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={`block cursor-pointer rounded-sm px-3 py-2 text-sm outline-none data-[highlighted]:bg-gray-100 ${
          isActive ? "font-medium text-gray-900" : "text-gray-700"
        }`}
      >
        {label}
      </Link>
    </DropdownMenu.Item>
  );
}

const DROPDOWN_CONTENT_CLASS =
  "z-50 min-w-48 rounded-md border border-gray-200 bg-white p-1 shadow-lg";

// The header's left-side nav, shared by the student (MainMenu) and tutor
// (TutorMainMenu) menus — each just passes its own entries. Below `md` the
// whole menu collapses into a ☰ dropdown instead of the plain inline nav
// (both markup blocks are always in the DOM; Tailwind's `hidden`/`md:` pair
// decides which one paints), where each group shows as a labelled section.
export function GroupedNavMenu({ entries }: { entries: MenuEntry[] }) {
  const t = useTranslations("Header");
  const pathname = usePathname();

  return (
    <>
      <nav className="hidden items-center gap-4 md:flex">
        {entries.map((entry) => {
          if (!isGroup(entry)) {
            const isActive = pathname === entry.href;
            return (
              <Link
                key={entry.href}
                href={entry.href}
                aria-current={isActive ? "page" : undefined}
                className={`${INLINE_LINK_CLASS} ${isActive ? "text-gray-900" : "text-gray-500 hover:text-gray-900"}`}
              >
                {t(entry.labelKey)}
              </Link>
            );
          }
          const groupActive = entry.items.some(
            (item) => pathname === item.href,
          );
          return (
            <DropdownMenu.Root key={entry.labelKey}>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={`${INLINE_LINK_CLASS} flex items-center gap-0.5 ${
                    groupActive
                      ? "text-gray-900"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {t(entry.labelKey)}
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="start"
                  sideOffset={8}
                  className={DROPDOWN_CONTENT_CLASS}
                >
                  {entry.items.map((item) => (
                    <DropdownLink
                      key={item.href}
                      item={item}
                      isActive={pathname === item.href}
                      label={t(item.labelKey)}
                    />
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
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
            className={DROPDOWN_CONTENT_CLASS}
          >
            {entries.map((entry) =>
              isGroup(entry) ? (
                <DropdownMenu.Group key={entry.labelKey}>
                  <DropdownMenu.Separator className="my-1 h-px bg-gray-100" />
                  <DropdownMenu.Label className="px-3 pb-1 pt-2 text-xs font-medium text-gray-400">
                    {t(entry.labelKey)}
                  </DropdownMenu.Label>
                  {entry.items.map((item) => (
                    <DropdownLink
                      key={item.href}
                      item={item}
                      isActive={pathname === item.href}
                      label={t(item.labelKey)}
                    />
                  ))}
                </DropdownMenu.Group>
              ) : (
                <DropdownLink
                  key={entry.href}
                  item={entry}
                  isActive={pathname === entry.href}
                  label={t(entry.labelKey)}
                />
              ),
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
