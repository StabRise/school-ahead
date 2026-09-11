"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import {
  getListPreschoolStoriesQueryKey,
  useDeletePreschoolStory,
  useListPreschoolStories,
} from "@school-ahead/api-client/browser/preschool/preschool";
import type { StoryOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Link } from "@/i18n/navigation";
import { SimplePageContainer } from "@/components/simple/page-container";
import { SimpleEntityIcon } from "@/components/simple/entity-icon";

// Same Notion-style, monochrome, borderless row list as TutorSubjectsPage —
// each row links to its own edit page (/tutor/stories/[storyId], a real
// page rather than a popup, so the markdown editor has room to breathe),
// same "click the row to open its detail page" convention as SubjectRow.
const ROW_GRID = "grid grid-cols-[1.5rem_minmax(0,1fr)_2.5rem] items-center gap-3";

function DeleteStoryButton({ story }: { story: StoryOut }) {
  const t = useTranslations("TutorStories");
  const queryClient = useQueryClient();
  const deleteStory = useDeletePreschoolStory();

  // Row is wrapped in a Link (see StoryRow) — stop the click from also
  // navigating, same reasoning as tutor-subject-detail-page.tsx's
  // DeleteLessonButton.
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(t("confirmDelete", { title: story.title }))) return;
    deleteStory.mutate(
      { storyId: story.id },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPreschoolStoriesQueryKey() }),
        onError: () => window.alert(t("deleteError")),
      },
    );
  };

  return (
    <button
      type="button"
      title={t("remove")}
      aria-label={t("remove")}
      onClick={handleClick}
      disabled={deleteStory.isPending}
      className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function StoryRow({ story }: { story: StoryOut }) {
  return (
    <li>
      <Link href={`/tutor/stories/${story.id}`} className={`${ROW_GRID} px-2 py-2 hover:bg-gray-50`}>
        <SimpleEntityIcon iconUrl={story.cover_image} fallback={BookOpen} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-gray-900">{story.title}</span>
          {story.subtitle && <span className="truncate text-xs text-gray-500">{story.subtitle}</span>}
        </span>
        <DeleteStoryButton story={story} />
      </Link>
    </li>
  );
}

export function TutorStoriesPage() {
  const t = useTranslations("TutorStories");
  const { data: stories, isLoading, isError } = useListPreschoolStories();

  return (
    <SimplePageContainer title={t("title")}>
      <div className="mb-3 flex items-center justify-end">
        <Link
          href="/tutor/stories/new"
          className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("addStoryButton")}
        </Link>
      </div>

      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}
      {!isLoading && !isError && (stories?.length ?? 0) === 0 && <p className="text-sm text-gray-500">{t("empty")}</p>}

      {stories && stories.length > 0 && (
        <ul className="min-w-[24rem] divide-y divide-gray-100">
          {stories.map((story) => (
            <StoryRow key={story.id} story={story} />
          ))}
        </ul>
      )}
    </SimplePageContainer>
  );
}
