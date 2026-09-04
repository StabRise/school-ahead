"use client";

import { useTranslations } from "next-intl";
import { useAuthStore } from "@school-ahead/api-client";
import { PageContainer } from "@/components/page-container";
import { AvatarPicker } from "@/components/profile/avatar-picker";
import { AvatarPreview } from "@/components/profile/avatar-preview";
import { AvatarWardrobe } from "@/components/profile/avatar-wardrobe";
import { PreschoolProfileView } from "@/components/preschool/profile-view";

// Student Profile page — docs/core/avatar.md. Character selection (2.1) plus
// its wardrobe customization (2.2, clothing/headwear/accessory); the
// shop/Diamond-price and home-decoration sections that doc also describes
// will live here as further sections once built. General account settings
// (see components/settings/settings-page.tsx) live on their own page rather
// than here.
//
// Preschool-mode branch follows the same convention as
// components/lesson-wizard/student-lesson-view.tsx / components/calendar/
// student-calendar-view.tsx: the top-level view component reads
// `interfaceMode` and early-returns the Preschool* variant.
export function ProfilePage() {
  const t = useTranslations("Profile");
  const isPreschool = useAuthStore((state) => state.user?.interfaceMode === "preschool");

  if (isPreschool) {
    return <PreschoolProfileView />;
  }

  return (
    <PageContainer title={t("title")}>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <AvatarPreview />
        <div className="flex flex-1 flex-col gap-6">
          <AvatarPicker />
          <AvatarWardrobe />
        </div>
      </div>
    </PageContainer>
  );
}
