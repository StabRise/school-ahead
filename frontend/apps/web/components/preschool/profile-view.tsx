"use client";

import { useTranslations } from "next-intl";
import { Cloud, Raccoon, Sun } from "@school-ahead/preschool-ui";
import { AvatarPicker } from "@/components/profile/avatar-picker";
import { AvatarPreview } from "@/components/profile/avatar-preview";
import { AvatarWardrobe } from "@/components/profile/avatar-wardrobe";

// Preschool-mode variant of /profile — same convention as
// components/preschool/lesson-view.tsx (PreschoolLessonView) and
// @school-ahead/preschool-ui's PreschoolCalendar: a colorful in-flow screen
// (not a fullscreen takeover, since this is a page reached from the
// site's own header/nav, not an immersive lesson/game). Reuses
// AvatarPreview/AvatarPicker/AvatarWardrobe as-is — they read
// interfaceMode themselves and already render their bigger, colorful
// variant when it's "preschool" (see docs/core/avatar.md section 2 for the
// underlying avatar/wardrobe model these implement).
export function PreschoolProfileView() {
  const t = useTranslations("Profile");

  return (
    <div className="relative flex flex-1 flex-col bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
      <div className="pointer-events-none absolute inset-0">
        <Cloud className="left-6 top-4 h-8 w-14 opacity-90" />
        <Cloud className="right-8 top-8 h-6 w-12 opacity-70" />
        <Sun className="right-1/4 top-6 h-8 w-8" />
      </div>

      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-8 p-4 sm:p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Raccoon mood="happy" className="h-20 w-20" />
          <h1 className="text-3xl font-extrabold text-emerald-900">{t("preschoolTitle")}</h1>
        </div>

        <AvatarPreview />

        <div className="flex w-full flex-col items-center gap-8">
          <AvatarPicker />
          <AvatarWardrobe />
        </div>
      </div>
    </div>
  );
}
