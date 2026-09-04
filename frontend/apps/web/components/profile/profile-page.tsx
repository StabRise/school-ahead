"use client";

import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/page-container";
import { AvatarPicker } from "@/components/profile/avatar-picker";
import { AvatarPreview } from "@/components/profile/avatar-preview";
import { AvatarWardrobe } from "@/components/profile/avatar-wardrobe";

// Student Profile page — docs/core/avatar.md. Character selection (2.1) plus
// its wardrobe customization (2.2, clothing/headwear/accessory); the
// shop/Diamond-price and home-decoration sections that doc also describes
// will live here as further sections once built. General account settings
// (see components/settings/settings-page.tsx) live on their own page rather
// than here.
export function ProfilePage() {
  const t = useTranslations("Profile");

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
