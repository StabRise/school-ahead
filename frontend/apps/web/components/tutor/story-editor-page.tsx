"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, ExternalLink } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetTutorPreschoolStoryQueryKey,
  getListPreschoolStoriesQueryKey,
  useCreateTutorPreschoolStory,
  useDeleteTutorPreschoolStory,
  useGetTutorPreschoolStory,
  useUpdateTutorPreschoolStory,
} from "@school-ahead/api-client/browser/preschool/preschool";
import type { StoryDetailOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Link, useRouter } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SimplePageContainer } from "@/components/simple/page-container";
import { FileDropzone } from "@/components/file-dropzone";
import { StoryMarkdownEditor } from "@school-ahead/markdown-editor/story";
import { StoryAssetSidebar } from "@/components/tutor/story-asset-sidebar";

// How often unsaved edits get auto-saved (see the effect below) — a plain
// interval rather than debouncing every keystroke, so a tutor mid-sentence
// isn't saved into an awkward half-typed state, and content field
// (StoryRichTextEditor) doesn't re-mount/lose cursor position on every save.
const AUTOSAVE_INTERVAL_MS = 20_000;

const NEW_STORY_TITLE = "Нова казка";

// Same export endpoint/URL shape as tutor-stories-page.tsx's
// DownloadStoryButton — duplicated rather than shared since it's a
// one-line string build, not real logic.
function downloadUrl(storyId: number): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/api/preschool/tutor/stories/${storyId}/export`;
}

// Local form state is seeded from `story` once on mount, same convention as
// tutor-lesson-detail-page.tsx's LessonEditForm — the caller below (
// StoryEditorPage) mounts this fresh (via `key`) once the story has loaded.
//
// `story` is null for a brand-new draft (app/[locale]/(tutor)/tutor/
// stories/new/page.tsx renders this with no story row created yet) — the
// form starts dirty in that case, so the very first autosave tick creates
// the row automatically, a few seconds in, with whatever title/subtitle/
// content the tutor has typed by then (or just the default title if
// nothing yet). `performSave` below sends the exact same payload either
// way; only whether it POSTs (create) or PATCHes (update) depends on
// whether a real id exists yet. Everything that needs a real id — the
// asset sidebar, publish/delete, "view in game" — stays hidden until then.
function StoryForm({ story, onDeleted }: { story: StoryDetailOut | null; onDeleted: () => void }) {
  const t = useTranslations("TutorStories");
  const router = useRouter();
  const queryClient = useQueryClient();
  const createStory = useCreateTutorPreschoolStory();
  const updateStory = useUpdateTutorPreschoolStory();
  const deleteStory = useDeleteTutorPreschoolStory();

  const [title, setTitle] = useState(story?.title ?? NEW_STORY_TITLE);
  const [subtitle, setSubtitle] = useState(story?.subtitle ?? "");
  const [content, setContent] = useState(story?.content ?? "");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [isDirty, setIsDirty] = useState(story === null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // The persisted id, once a draft's first autosave (or manual Save)
  // creates the row. Everything below that needs a real story to exist
  // (asset sidebar, publish/delete, preview, "view in game") checks this
  // instead of `story`, since `story` itself never changes after mount.
  const [savedStory, setSavedStory] = useState<StoryDetailOut | null>(story);

  const isSaving = createStory.isPending || updateStory.isPending;
  const saveError = createStory.isError || updateStory.isError;

  const invalidate = (id: number) => {
    queryClient.invalidateQueries({ queryKey: getListPreschoolStoriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTutorPreschoolStoryQueryKey(id) });
  };

  // Every field setter also marks the form dirty — read by the autosave
  // interval below (via isDirtyRef, so the interval itself doesn't need to
  // restart on every keystroke).
  const markDirty = () => setIsDirty(true);

  const performSave = () => {
    const data = { title, subtitle, content, ...(coverFile ? { cover_image: coverFile } : {}) };

    if (savedStory === null) {
      createStory.mutate(
        { data },
        {
          onSuccess: (created) => {
            setSavedStory(created);
            setIsDirty(false);
            setLastSavedAt(new Date());
            setCoverFile(null);
            invalidate(created.id);
            // Shallow URL sync — this same form instance keeps running
            // (no remount), just now pointed at the real story's route so
            // a refresh/share link lands on it instead of back at /new.
            router.replace(`/tutor/stories/${created.id}`);
          },
        },
      );
      return;
    }

    updateStory.mutate(
      { storyId: savedStory.id, data },
      {
        onSuccess: (updated) => {
          setSavedStory(updated);
          setIsDirty(false);
          setLastSavedAt(new Date());
          setCoverFile(null); // already reflected in story.cover_image after invalidate — avoid re-uploading it again next save
          invalidate(updated.id);
        },
      },
    );
  };

  // Refs so the 20s interval (set up once, see below) always calls the
  // latest performSave/isDirty without needing to be re-created — a fresh
  // setInterval every keystroke would mean "20s since the last edit"
  // instead of a steady "every 20s" cadence. Synced in an effect (every
  // render), not inline during render itself — mutating a ref's `.current`
  // while rendering is not allowed (react-hooks/refs).
  const performSaveRef = useRef(performSave);
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    performSaveRef.current = performSave;
    isDirtyRef.current = isDirty;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (isDirtyRef.current) performSaveRef.current();
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSave();
  };

  const handleTogglePublish = () => {
    if (!savedStory) return;
    updateStory.mutate(
      { storyId: savedStory.id, data: { is_published: !savedStory.is_published } },
      { onSuccess: (updated) => { setSavedStory(updated); invalidate(updated.id); } },
    );
  };

  const handleDelete = () => {
    if (!savedStory) return;
    if (!window.confirm(t("confirmDelete", { title: savedStory.title }))) return;
    deleteStory.mutate(
      { storyId: savedStory.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPreschoolStoriesQueryKey() });
          onDeleted();
        },
        onError: () => window.alert(t("deleteError")),
      },
    );
  };

  const handleDownload = () => {
    if (!savedStory) return;
    window.location.href = downloadUrl(savedStory.id);
  };

  // Patches `savedStory.assets` in place after an upload/delete in the
  // sidebar — `savedStory` is local state seeded once from the query (see
  // its declaration above), so invalidating the query alone wouldn't
  // repaint the sidebar until this component happened to remount.
  const handleAssetsChange = (assets: StoryDetailOut["assets"]) => {
    setSavedStory((current) => (current ? { ...current, assets } : current));
  };

  // Rendered both above the form (so a tutor scrolled deep into a long
  // story's content doesn't have to scroll back up just to save/publish)
  // and at its original spot below the content editor — `saveButtonType`
  // "submit" only for the bottom copy, which sits inside the actual <form>
  // (Enter-to-submit from the title/subtitle inputs targets that one); the
  // top copy is a plain button calling performSave directly since it's
  // rendered outside the form.
  const actionButtons = (saveButtonType: "button" | "submit") => (
    <div className="flex flex-wrap gap-2">
      <button
        type={saveButtonType}
        onClick={saveButtonType === "button" ? performSave : undefined}
        disabled={!title.trim() || isSaving}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {t("saveButton")}
      </button>
      {savedStory && (
        <button
          type="button"
          onClick={handleTogglePublish}
          disabled={isSaving}
          className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${
            savedStory.is_published
              ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {savedStory.is_published ? t("unpublishButton") : t("publishButton")}
        </button>
      )}
      {savedStory && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteStory.isPending}
          className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {t("remove")}
        </button>
      )}
      {savedStory && (
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download className="h-3.5 w-3.5" />
          {t("downloadButton")}
        </button>
      )}
      {savedStory && (
        // The public game route only serves published stories (see
        // backend/preschool/api.py's get_story) — an unpublished one
        // 404s there, so the link is disabled rather than opening onto
        // an empty/broken preview.
        <Link
          href={`/games/stories/${savedStory.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!savedStory.is_published}
          title={savedStory.is_published ? undefined : t("viewInGameRequiresPublish")}
          className={`flex items-center gap-1.5 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 ${
            savedStory.is_published ? "" : "pointer-events-none opacity-50"
          }`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t("viewInGame")}
        </Link>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {actionButtons("button")}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <form onSubmit={handleSubmit} className="flex max-w-2xl flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="story-title" className="text-xs font-medium text-gray-700">
              {t("storyTitle")}
            </label>
            <input
              id="story-title"
              type="text"
              required
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                markDirty();
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="story-subtitle" className="text-xs font-medium text-gray-700">
              {t("subtitle")}
            </label>
            <input
              id="story-subtitle"
              type="text"
              value={subtitle}
              onChange={(e) => {
                setSubtitle(e.target.value);
                markDirty();
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-700">{t("coverImage")}</span>
            <div className="flex items-center gap-3">
              {savedStory?.cover_image && !coverFile && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={savedStory.cover_image} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
              )}
              <FileDropzone
                id="story-cover"
                hint={t("dropzoneHint")}
                multiple={false}
                accept="image/*"
                onFilesSelected={(files) => {
                  setCoverFile(files?.[0] ?? null);
                  markDirty();
                }}
              />
            </div>
            {coverFile && <p className="text-xs text-gray-500">{coverFile.name}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-700">{t("content")}</span>
            <StoryMarkdownEditor
              value={content}
              onChange={(next) => {
                setContent(next);
                markDirty();
              }}
              previewSlug={savedStory?.slug ?? "draft"}
              rows={16}
            />
          </div>

          {saveError && <p className="text-sm text-red-600">{t("saveError")}</p>}

          <p className="text-xs text-gray-500">
            {isSaving
              ? t("savingStatus")
              : isDirty
                ? savedStory === null
                  ? t("notCreatedYetStatus")
                  : t("unsavedStatus")
                : lastSavedAt && t("savedAtStatus", { time: lastSavedAt.toLocaleTimeString() })}
          </p>

          {actionButtons("submit")}
        </form>

        {savedStory ? (
          <StoryAssetSidebar
            storyId={savedStory.id}
            assets={savedStory.assets}
            content={content}
            onAssetsChange={handleAssetsChange}
          />
        ) : (
          <p className="max-w-xs text-xs text-gray-500 lg:mt-6">{t("assetsAvailableAfterSaveHint")}</p>
        )}
      </div>
    </div>
  );
}

export function StoryEditorPage({ storyId }: { storyId: number | null }) {
  const t = useTranslations("TutorStories");
  const router = useRouter();
  const { data: story, isLoading, isError } = useGetTutorPreschoolStory(storyId ?? 0, { query: { enabled: storyId !== null } });

  const displayTitle = storyId === null ? NEW_STORY_TITLE : (story?.title ?? t("editTitle"));

  return (
    <SimplePageContainer title={displayTitle}>
      <div className="mb-2">
        <Breadcrumbs items={[{ label: t("title"), href: "/tutor/stories" }, { label: displayTitle }]} />
      </div>

      {story && (
        <p className="mb-4 text-xs">
          {story.is_published ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
              {t("publishedBadge")}
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">{t("draftBadge")}</span>
          )}
        </p>
      )}

      {storyId !== null && isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {storyId !== null && isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {storyId === null && <StoryForm story={null} onDeleted={() => router.replace("/tutor/stories")} />}
      {story && <StoryForm key={story.id} story={story} onDeleted={() => router.replace("/tutor/stories")} />}
    </SimplePageContainer>
  );
}
