"use client";

import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/page-container";
import { AvatarPicker } from "@/components/profile/avatar-picker";

// Student Profile page — docs/core/avatar.md. Currently just the avatar
// picker; the wardrobe/shop and home-decoration sections that doc also
// describes will live here as further sections once built.
export function ProfilePage() {
  const t = useTranslations("Profile");

  return (
    <PageContainer title={t("title")}>
      <AvatarPicker />
    </PageContainer>
  );
}
