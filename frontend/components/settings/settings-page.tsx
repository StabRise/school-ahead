"use client";

import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/page-container";
import { TranslationSettings } from "@/components/settings/translation-settings";

// Student account settings — reachable from the header's avatar menu (see
// components/header.tsx). Currently just the read-along "Переклад
// матеріалів" section; further settings sections can be added alongside it.
export function SettingsPage() {
  const t = useTranslations("Settings");

  return (
    <PageContainer title={t("title")}>
      <TranslationSettings />
    </PageContainer>
  );
}
