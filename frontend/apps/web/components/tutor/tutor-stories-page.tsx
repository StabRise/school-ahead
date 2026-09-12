"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Download, Plus, Trash2, Upload } from "lucide-react";
import {
  getListTutorPreschoolStoriesQueryKey,
  useDeleteTutorPreschoolStory,
  useImportTutorPreschoolStory,
  useListTutorPreschoolStories,
} from "@school-ahead/api-client/browser/preschool/preschool";
import type { StoryOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Link, useRouter } from "@/i18n/navigation";
import { SimplePageContainer } from "@/components/simple/page-container";
import { SimpleEntityIcon } from "@/components/simple/entity-icon";

// Same Notion-style, monochrome, borderless row list as TutorSubjectsPage —
// each row links to its own edit page (/tutor/stories/[storyId], a real
// page rather than a popup, so the markdown editor has room to breathe),
// same "click the row to open its detail page" convention as SubjectRow.
// Uses the tutor-only list endpoint (not the public one the game reads),
// since drafts must be visible here for editing even before they're
// published.
const ROW_GRID = "grid grid-cols-[1.5rem_minmax(0,1fr)_4rem_2.5rem_2.5rem] items-center gap-3";

function downloadUrl(storyId: number): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/api/preschool/tutor/stories/${storyId}/export`;
}

// A plain <button> (not an <a>) even though this triggers a download —
// StoryRow already wraps the whole row in a Link (an <a>), and nesting a
// second <a> inside it is invalid HTML the browser would silently
// restructure. Navigating via window.location still triggers a real
// browser download: the response carries Content-Disposition: attachment
// (see backend's export_tutor_story), so the tab never actually leaves
// this page.
function DownloadStoryButton({ story }: { story: StoryOut }) {
  const t = useTranslations("TutorStories");

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.href = downloadUrl(story.id);
  };

  return (
    <button
      type="button"
      title={t("downloadButton")}
      aria-label={t("downloadButton")}
      onClick={handleClick}
      className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
    >
      <Download className="h-3.5 w-3.5" />
    </button>
  );
}

function DeleteStoryButton({ story }: { story: StoryOut }) {
  const t = useTranslations("TutorStories");
  const queryClient = useQueryClient();
  const deleteStory = useDeleteTutorPreschoolStory();

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
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTutorPreschoolStoriesQueryKey() }),
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
  const t = useTranslations("TutorStories");
  return (
    <li>
      <Link href={`/tutor/stories/${story.id}`} className={`${ROW_GRID} px-2 py-2 hover:bg-gray-50`}>
        <SimpleEntityIcon iconUrl={story.cover_image} fallback={BookOpen} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-gray-900">{story.title}</span>
          {story.subtitle && <span className="truncate text-xs text-gray-500">{story.subtitle}</span>}
        </span>
        <span className="justify-self-start">
          {story.is_published ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              {t("publishedBadge")}
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              {t("draftBadge")}
            </span>
          )}
        </span>
        <DownloadStoryButton story={story} />
        <DeleteStoryButton story={story} />
      </Link>
    </li>
  );
}

// Uploads a story.md + cover + asset-files ZIP (see backend's
// import_tutor_story / services.build_story_zip) as a new, unpublished
// story — the inverse of DownloadStoryButton above, and also a way to bring
// an existing hand-authored public/static/stories/<title>/ folder (zipped
// up) into the DB.
function ImportStoryButton() {
  const t = useTranslations("TutorStories");
  const router = useRouter();
  const queryClient = useQueryClient();
  const importStory = useImportTutorPreschoolStory();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the exact same file later
    if (!file) return;
    importStory.mutate(
      { data: { file } },
      {
        onSuccess: (story) => {
          queryClient.invalidateQueries({ queryKey: getListTutorPreschoolStoriesQueryKey() });
          router.push(`/tutor/stories/${story.id}`);
        },
        onError: () => window.alert(t("importError")),
      },
    );
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={handleFileSelected}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={importStory.isPending}
        className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <Upload className="h-3.5 w-3.5" />
        {importStory.isPending ? t("importingStatus") : t("importButton")}
      </button>
    </>
  );
}

export function TutorStoriesPage() {
  const t = useTranslations("TutorStories");
  const { data: stories, isLoading, isError } = useListTutorPreschoolStories();

  return (
    <SimplePageContainer title={t("title")}>
      <div className="mb-3 flex items-center justify-end gap-2">
        <ImportStoryButton />
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
        <ul className="min-w-[28rem] divide-y divide-gray-100">
          {stories.map((story) => (
            <StoryRow key={story.id} story={story} />
          ))}
        </ul>
      )}
    </SimplePageContainer>
  );
}
