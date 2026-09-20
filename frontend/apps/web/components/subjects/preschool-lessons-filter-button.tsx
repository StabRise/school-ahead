"use client";

import { useTranslations } from "next-intl";
import {
  PreschoolOptionsGear,
  SUBJECT_LESSON_OPEN_MODES,
  useLessonOpenModeStore,
  useSubjectLessonOpenMode,
  type OptionsGearOption,
  type SubjectLessonOpenMode,
} from "@school-ahead/preschool-ui";
import { PRESCHOOL_LESSONS_FILTERS, type PreschoolLessonsFilter } from "@/lib/preschool-lessons-filter";
import { usePreschoolLessonsFilterStore } from "@/stores/preschool-lessons-filter-store";

const FILTER_EMOJI: Record<PreschoolLessonsFilter, string> = {
  available: "🎯",
  all: "📚",
  favorites: "❤️",
};

const OPEN_MODE_EMOJI: Record<SubjectLessonOpenMode, string> = {
  inherit: "🗂️",
  open: "📖",
  fullscreen: "▶️",
};

// The gear in the preschool subject page's top-right corner — the panel and
// button are PreschoolOptionsGear, shared with the bookshelf. It has:
//   - which lessons the page lists (a signed-in student only) — see
//     lib/preschool-lessons-filter.ts; the page's queries are keyed by the choice,
//     so changing it reloads the tabs and the grid;
//   - what tapping a lesson of THIS subject does: open it, play its video
//     fullscreen, or — the default — whatever the bookshelf's ⚙️ says (see
//     @school-ahead/preschool-ui's lesson-open-mode.ts). Kept on this device, and
//     the only choice a visitor who isn't signed in has here.
export function PreschoolLessonsFilterButton({ subjectId, guest }: { subjectId: number; guest: boolean }) {
  const t = useTranslations("PreschoolSubjectDetail");
  const filter = usePreschoolLessonsFilterStore((state) => state.filter);
  const setFilter = usePreschoolLessonsFilterStore((state) => state.setFilter);
  const openMode = useSubjectLessonOpenMode(subjectId);
  const setSubjectOpenMode = useLessonOpenModeStore((state) => state.setSubjectMode);

  const openModeOptions: OptionsGearOption<SubjectLessonOpenMode>[] = SUBJECT_LESSON_OPEN_MODES.map((option) => ({
    value: option,
    emoji: OPEN_MODE_EMOJI[option],
    label: t(`openMode.${option}`),
  }));
  const chooseOpenMode = (next: SubjectLessonOpenMode) => setSubjectOpenMode(subjectId, next);

  // A visitor has no lessons to filter: the open-mode choice is the whole panel.
  if (guest) {
    return (
      <PreschoolOptionsGear
        value={openMode}
        options={openModeOptions}
        onChange={chooseOpenMode}
        buttonLabel={t("settingsButton")}
        title={t("openModeTitle")}
      />
    );
  }

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
      secondary={{
        value: openMode,
        options: openModeOptions,
        onChange: (next) => chooseOpenMode(next as SubjectLessonOpenMode),
        title: t("openModeTitle"),
      }}
    />
  );
}
