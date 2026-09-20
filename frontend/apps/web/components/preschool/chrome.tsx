"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useIsPreschoolStudent } from "@school-ahead/api-client";
import { PreschoolButton } from "@school-ahead/preschool-ui";
import { usePathname } from "@/i18n/navigation";
import { preschoolHomeKind } from "@/lib/preschool-chrome";

// What stands in for the site header while a student is in preschool mode (the
// header renders nothing for them — see components/header.tsx and
// lib/preschool-chrome.ts): a 🏠 back to the dashboard — fixed in the top-left
// corner on the pages with room for it (so their headings stay at the top), in
// a slim sky-coloured strip above the rest, and nowhere on the pages that have
// one of their own.
//
// It also flags the page as header-less (`<html data-headerless>`), which the
// games read to sit their fixed controls at the top of the screen instead of
// below a header (see packages/preschool-games/src/kit/game-controls.ts).
export function PreschoolChrome() {
  const t = useTranslations("PreschoolChrome");
  const locale = useLocale();
  const pathname = usePathname();
  const isPreschool = useIsPreschoolStudent();

  useEffect(() => {
    const root = document.documentElement;
    if (isPreschool) root.setAttribute("data-headerless", "");
    else root.removeAttribute("data-headerless");
    return () => root.removeAttribute("data-headerless");
  }, [isPreschool]);

  const kind = isPreschool ? preschoolHomeKind(pathname) : "none";
  if (kind === "none") return null;

  // PreschoolButton links with next/link, which knows nothing about the
  // locale, so the href carries it explicitly.
  const home = (
    <PreschoolButton
      href={`/${locale}`}
      icon="🏠"
      label={t("homeLabel")}
      ringColorClassName="ring-emerald-400"
      position={kind === "corner" ? "top-left" : "static"}
    />
  );
  return kind === "corner" ? home : <div className="bg-sky-200 px-4 py-2">{home}</div>;
}
