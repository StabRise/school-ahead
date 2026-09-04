"use client";

import { useTranslations } from "next-intl";
import { useListMyAchievements } from "@school-ahead/api-client/browser/achievements/achievements";
import { PageContainer } from "@/components/page-container";
import { AchievementCard } from "./achievement-card";

export function MyAchievementsPage() {
  const t = useTranslations("MyAchievements");
  const { data, isLoading, isError } = useListMyAchievements();

  const achievements = data ?? [];

  return (
    <PageContainer title={t("title")}>
      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {!isLoading && !isError && achievements.length === 0 && (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      )}

      {achievements.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {achievements.map((achievement) => (
            <li key={achievement.subject_id}>
              <AchievementCard achievement={achievement} />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
