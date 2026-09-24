"use client";

import { useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Download,
  ExternalLink,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  getListTutorPreschoolStoriesQueryKey,
  useDeleteTutorPreschoolStory,
  useImportTutorPreschoolStory,
  useListTutorPreschoolStories,
} from "@school-ahead/api-client/browser/preschool/preschool";
import type { QuizLanguage, StoryOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { ContentLanguageSelect } from "@/components/tutor/content-language-select";
import { Link, useRouter } from "@/i18n/navigation";
import { SimplePageContainer } from "@/components/simple/page-container";
import { SimpleEntityIcon } from "@/components/simple/entity-icon";
import {
  SortableHeader,
  useSortState,
  type SortDirection,
} from "@/components/simple/sortable-header";
import { useDialogs } from "@/components/dialogs/app-dialogs";

// Same Notion-style, monochrome, borderless row list as TutorSubjectsPage —
// each row links to its own edit page (/tutor/stories/[storyId], a real
// page rather than a popup, so the markdown editor has room to breathe),
// same "click the row to open its detail page" convention as SubjectRow.
// Uses the tutor-only list endpoint (not the public one the game reads),
// since drafts must be visible here for editing even before they're
// published.
const ROW_GRID =
  "grid grid-cols-[1.5rem_minmax(0,1fr)_6rem_5rem_2.5rem_2.5rem_2.5rem] items-center gap-3";

type SortKey = "title" | "status" | "updated";
type StatusFilter = "all" | "published" | "draft";

function compareStories(
  a: StoryOut,
  b: StoryOut,
  key: SortKey,
  direction: SortDirection,
): number {
  const sign = direction === "asc" ? 1 : -1;
  if (key === "title") return sign * a.title.localeCompare(b.title, "uk");
  if (key === "status") {
    // Drafts first ascending; ties fall back to title so the order is stable.
    const byStatus = Number(a.is_published) - Number(b.is_published);
    return byStatus !== 0
      ? sign * byStatus
      : a.title.localeCompare(b.title, "uk");
  }
  return (
    sign * (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
  );
}

// Case-insensitive match on title or subtitle, then the status filter.
function filterStories(
  stories: StoryOut[],
  query: string,
  status: StatusFilter,
): StoryOut[] {
  const needle = query.trim().toLocaleLowerCase("uk");
  return stories.filter((story) => {
    if (status === "published" && !story.is_published) return false;
    if (status === "draft" && story.is_published) return false;
    if (!needle) return true;
    return `${story.title} ${story.subtitle}`
      .toLocaleLowerCase("uk")
      .includes(needle);
  });
}

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

// Same "plain <button>, not a nested <a>" reasoning as DownloadStoryButton
// above — StoryRow already wraps the row in a Link. Opens in a new tab via
// window.open rather than the i18n-aware Link component, since that can't
// be nested here either; /games/stories/<slug> is a public, locale-prefix-
// optional path (see middleware.ts's PUBLIC_PATHS handling of "/games"),
// same route the story editor's own "View in game" link points at. The
// public game route only serves published stories (backend's get_story),
// so this is disabled for drafts rather than opening onto a 404.
function ViewInGameButton({ story }: { story: StoryOut }) {
  const t = useTranslations("TutorStories");

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(
      `/games/stories/${story.slug}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <button
      type="button"
      title={
        story.is_published ? t("viewInGame") : t("viewInGameRequiresPublish")
      }
      aria-label={t("viewInGame")}
      onClick={handleClick}
      disabled={!story.is_published}
      className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-40"
    >
      <ExternalLink className="h-3.5 w-3.5" />
    </button>
  );
}

function DeleteStoryButton({ story }: { story: StoryOut }) {
  const t = useTranslations("TutorStories");
  const dialogs = useDialogs();
  const queryClient = useQueryClient();
  const deleteStory = useDeleteTutorPreschoolStory();

  // Row is wrapped in a Link (see StoryRow) — stop the click from also
  // navigating, same reasoning as tutor-subject-detail-page.tsx's
  // DeleteLessonButton.
  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      !(await dialogs.confirm({
        message: t("confirmDelete", { title: story.title }),
        tone: "danger",
      }))
    )
      return;
    deleteStory.mutate(
      { storyId: story.id },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({
            queryKey: getListTutorPreschoolStoriesQueryKey(),
          }),
        onError: () => dialogs.error(t("deleteError")),
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

// The cover is only 16px in the row — hovering it scales it up in place
// (same trick as the story editor's asset sidebar) so a tutor can tell
// covers apart without opening each story. `cover_image` is already a
// 640px thumbnail, so the enlarged picture stays sharp.
function StoryCover({ story }: { story: StoryOut }) {
  if (!story.cover_image)
    return <SimpleEntityIcon iconUrl={null} fallback={BookOpen} />;
  return (
    <span className="relative z-0 inline-flex shrink-0 hover:z-20">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={story.cover_image}
        alt=""
        className="size-5 origin-left rounded object-cover shadow-none transition-transform duration-150 hover:scale-[5] hover:shadow-xl"
      />
    </span>
  );
}

function StoryRow({ story }: { story: StoryOut }) {
  const t = useTranslations("TutorStories");
  const format = useFormatter();
  return (
    <li>
      <Link
        href={`/tutor/stories/${story.id}`}
        className={`${ROW_GRID} px-2 py-2 hover:bg-gray-50`}
      >
        <StoryCover story={story} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-gray-900">
            {story.title}
          </span>
          {story.subtitle && (
            <span className="truncate text-xs text-gray-500">
              {story.subtitle}
            </span>
          )}
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
        <span
          className="text-xs text-gray-500"
          title={format.dateTime(new Date(story.updated_at), {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        >
          {format.dateTime(new Date(story.updated_at), { dateStyle: "short" })}
        </span>
        <ViewInGameButton story={story} />
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
// up) into the DB. The language picker beside it is the imported story's
// language (Ukrainian by default).
function ImportStoryButton() {
  const t = useTranslations("TutorStories");
  const dialogs = useDialogs();
  const router = useRouter();
  const queryClient = useQueryClient();
  const importStory = useImportTutorPreschoolStory();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [language, setLanguage] = useState<QuizLanguage>("uk");

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the exact same file later
    if (!file) return;
    importStory.mutate(
      { data: { file, language } },
      {
        onSuccess: (story) => {
          queryClient.invalidateQueries({
            queryKey: getListTutorPreschoolStoriesQueryKey(),
          });
          router.push(`/tutor/stories/${story.id}`);
        },
        onError: () => dialogs.error(t("importError")),
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
      <ContentLanguageSelect
        value={language}
        onChange={setLanguage}
        ariaLabel={t("importLanguageLabel")}
        disabled={importStory.isPending}
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

function StatusFilterPills({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
}) {
  const t = useTranslations("TutorStories");
  const options: { value: StatusFilter; label: string }[] = [
    { value: "all", label: t("statusFilterAll") },
    { value: "published", label: t("publishedBadge") },
    { value: "draft", label: t("draftBadge") },
  ];
  return (
    <div className="flex shrink-0 rounded-md border border-gray-300 p-0.5 text-xs font-medium">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded px-2 py-1 ${
            value === option.value
              ? "bg-gray-900 text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function TutorStoriesPage() {
  const t = useTranslations("TutorStories");
  const { data: stories, isLoading, isError } = useListTutorPreschoolStories();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Newest edits first by default — the story a tutor is working on stays on top.
  const { sort, toggleSort } = useSortState<SortKey>("updated", "desc");

  const visibleStories = useMemo(
    () =>
      filterStories(stories ?? [], query, statusFilter).sort((a, b) =>
        compareStories(a, b, sort.key, sort.direction),
      ),
    [stories, query, statusFilter, sort],
  );

  const header = (key: SortKey, label: string) => (
    <SortableHeader
      label={label}
      active={sort.key === key}
      direction={sort.direction}
      onClick={() => toggleSort(key)}
    />
  );

  return (
    <SimplePageContainer title={t("title")}>
      <div className="mb-3 flex items-center justify-end gap-2">
        <Link
          href="/games/stories"
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t("openGameButton")}
        </Link>
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
      {!isLoading && !isError && (stories?.length ?? 0) === 0 && (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      )}

      {stories && stories.length > 0 && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="relative flex min-w-48 flex-1 items-center">
              <Search
                className="pointer-events-none absolute left-2 size-3.5 text-gray-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="w-full rounded-md border border-gray-300 py-1.5 pl-7 pr-2 text-sm focus:border-gray-500 focus:outline-none"
              />
            </label>
            <StatusFilterPills
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </div>
          <div className="min-w-[34rem]">
            <div className={`${ROW_GRID} border-b border-gray-200 px-2 py-1.5`}>
              <span />
              {header("title", t("columnTitle"))}
              {header("status", t("columnStatus"))}
              {header("updated", t("columnUpdated"))}
            </div>
            {visibleStories.length === 0 ? (
              <p className="px-2 py-3 text-sm text-gray-500">
                {t("noMatches")}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {visibleStories.map((story) => (
                  <StoryRow key={story.id} story={story} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </SimplePageContainer>
  );
}
