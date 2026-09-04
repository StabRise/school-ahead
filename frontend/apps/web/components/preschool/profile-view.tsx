"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Cloud, Sun } from "@school-ahead/preschool-ui";
import { AvatarPreview } from "@/components/profile/avatar-preview";
import { AvatarWardrobe } from "@/components/profile/avatar-wardrobe";
import { ChangeCharacterDialog } from "@/components/profile/change-character-dialog";

// Preschool-mode variant of /profile — same convention as
// components/preschool/lesson-view.tsx (PreschoolLessonView) and
// @school-ahead/preschool-ui's PreschoolCalendar: a colorful in-flow screen
// (not a fullscreen takeover, since this is a page reached from the
// site's own header/nav, not an immersive lesson/game).
//
// Layout mirrors the default ProfilePage's own (character left, items
// right) rather than a new one — AvatarPicker moved out of the flow
// entirely into a popup (ChangeCharacterDialog) opened by the button under
// the character, so this column stays just the character + one button.
// AvatarPreview/AvatarWardrobe are reused as-is — they read interfaceMode
// themselves and already render their bigger, colorful variant when it's
// "preschool" (see docs/core/avatar.md section 2 for the underlying
// avatar/wardrobe model these implement).
export function PreschoolProfileView() {
  const t = useTranslations("Profile");
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="relative flex flex-1 flex-col bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
      <div className="pointer-events-none absolute inset-0">
        <Cloud className="left-6 top-4 h-8 w-14 opacity-90" />
        <Cloud className="right-8 top-8 h-6 w-12 opacity-70" />
        <Sun className="right-1/4 top-6 h-8 w-8" />
      </div>

      <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <h1 className="text-center text-3xl font-extrabold text-emerald-900 sm:text-left">
          {t("preschoolTitle")}
        </h1>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-3 sm:shrink-0">
            <AvatarPreview />
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="preschool-button w-full max-w-100 rounded-full bg-emerald-500 px-6 py-3 text-lg font-extrabold text-white shadow-lg ring-4 ring-emerald-300 transition hover:scale-105"
            >
              {t("changeCharacterButton")}
            </button>
          </div>

          <div className="flex flex-1 flex-col">
            <AvatarWardrobe />
          </div>
        </div>
      </div>

      <ChangeCharacterDialog open={pickerOpen} onOpenChange={setPickerOpen} />
    </div>
  );
}
