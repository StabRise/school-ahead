"use client";

import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/page-container";
import { TranslationSettings } from "@/components/settings/translation-settings";
import { ViewSettings } from "@/components/settings/view-settings";

// Student account settings — reachable from the header's avatar menu (see
// components/header.tsx): the dashboard view mode (Standard/Simple/
// Preschool) and the read-along "Переклад матеріалів" section; further
// settings sections can be added alongside them.
export function SettingsPage() {
  const t = useTranslations("Settings");

  return (
    <PageContainer title={t("title")}>
      <div className="flex flex-col gap-6">
        <ViewSettings />
        <TranslationSettings />
      </div>
    </PageContainer>
  );
}
