"use client";

import { useTranslations } from "next-intl";
import { PreschoolOptionsGear } from "@school-ahead/preschool-ui";
import { PRESCHOOL_LESSONS_FILTERS, type PreschoolLessonsFilter } from "@/lib/preschool-lessons-filter";
import { usePreschoolLessonsFilterStore } from "@/stores/preschool-lessons-filter-store";

const FILTER_EMOJI: Record<PreschoolLessonsFilter, string> = {
  available: "🎯",
  all: "📚",
  favorites: "❤️",
};

// The gear in the preschool subject page's top-right corner — the panel and
// button are PreschoolOptionsGear, shared with the bookshelf. The panel picks
// which lessons the page lists — see lib/preschool-lessons-filter.ts. The page's
// queries are keyed by the choice, so changing it reloads the tabs and the grid.
export function PreschoolLessonsFilterButton() {
  const t = useTranslations("PreschoolSubjectDetail");
  const filter = usePreschoolLessonsFilterStore((state) => state.filter);
  const setFilter = usePreschoolLessonsFilterStore((state) => state.setFilter);

  return (
    <PreschoolOptionsGear
      value={filter}
      options={PRESCHOOL_LESSONS_FILTERS.map((option) => ({
        value: option,
        emoji: FILTER_EMOJI[option],
        label: t(`filter.${option}`),
      }))}
      onChange={setFilter}
      buttonLabel={t("settingsButton")}
      title={t("filterTitle")}
    />
  );
}
