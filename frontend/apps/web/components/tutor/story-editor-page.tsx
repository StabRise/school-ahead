"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetTutorPreschoolStoryQueryKey,
  getListPreschoolStoriesQueryKey,
  useDeleteTutorPreschoolStory,
  useGetTutorPreschoolStory,
  useUpdateTutorPreschoolStory,
} from "@school-ahead/api-client/browser/preschool/preschool";
import type { StoryDetailOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { useRouter } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SimplePageContainer } from "@/components/simple/page-container";
import { FileDropzone } from "@/components/file-dropzone";
import { StoryMarkdownEditor } from "@/components/tutor/story-markdown-editor";
import { StoryAssetSidebar } from "@/components/tutor/story-asset-sidebar";

// How often unsaved edits get auto-saved (see the effect below) — a plain
// interval rather than debouncing every keystroke, so a tutor mid-sentence
// isn't saved into an awkward half-typed state, and content field
// (StoryRichTextEditor) doesn't re-mount/lose cursor position on every save.
const AUTOSAVE_INTERVAL_MS = 20_000;

// Local form state is seeded from `story` once on mount, same convention as
// tutor-lesson-detail-page.tsx's LessonEditForm — the caller below (
// StoryEditorPage) mounts this fresh (via `key`) once the story has loaded,
// so there's no need for an effect/guard to re-seed it. Every story reaching
// this form already exists in the DB (see app/[locale]/(tutor)/tutor/
// stories/new/page.tsx, which creates one server-side before ever
// navigating here), so there's no separate "create" mode to branch on.
function StoryForm({ story, onDeleted }: { story: StoryDetailOut; onDeleted: () => void }) {
  const t = useTranslations("TutorStories");
  const queryClient = useQueryClient();
  const updateStory = useUpdateTutorPreschoolStory();
  const deleteStory = useDeleteTutorPreschoolStory();

  const [title, setTitle] = useState(story.title);
  const [subtitle, setSubtitle] = useState(story.subtitle);
  const [content, setContent] = useState(story.content);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListPreschoolStoriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTutorPreschoolStoryQueryKey(story.id) });
  };

  // Every field setter also marks the form dirty — read by the autosave
  // interval below (via isDirtyRef, so the interval itself doesn't need to
  // restart on every keystroke).
  const markDirty = () => setIsDirty(true);

  const performSave = () => {
    updateStory.mutate(
      { storyId: story.id, data: { title, subtitle, content, ...(coverFile ? { cover_image: coverFile } : {}) } },
      {
        onSuccess: () => {
          setIsDirty(false);
          setLastSavedAt(new Date());
          setCoverFile(null); // already reflected in story.cover_image after invalidate — avoid re-uploading it again next save
          invalidate();
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
    updateStory.mutate({ storyId: story.id, data: { is_published: !story.is_published } }, { onSuccess: invalidate });
  };

  const handleDelete = () => {
    if (!window.confirm(t("confirmDelete", { title: story.title }))) return;
    deleteStory.mutate(
      { storyId: story.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPreschoolStoriesQueryKey() });
          onDeleted();
        },
        onError: () => window.alert(t("deleteError")),
      },
    );
  };

  return (
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
            {story.cover_image && !coverFile && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={story.cover_image} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
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
            previewSlug={`story-${story.id}`}
            rows={16}
          />
        </div>

        {updateStory.isError && <p className="text-sm text-red-600">{t("saveError")}</p>}

        <p className="text-xs text-gray-500">
          {updateStory.isPending
            ? t("savingStatus")
            : isDirty
              ? t("unsavedStatus")
              : lastSavedAt && t("savedAtStatus", { time: lastSavedAt.toLocaleTimeString() })}
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!title.trim() || updateStory.isPending}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("saveButton")}
          </button>
          <button
            type="button"
            onClick={handleTogglePublish}
            disabled={updateStory.isPending}
            className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              story.is_published
                ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {story.is_published ? t("unpublishButton") : t("publishButton")}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteStory.isPending}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {t("remove")}
          </button>
        </div>
      </form>

      <StoryAssetSidebar storyId={story.id} assets={story.assets} content={content} />
    </div>
  );
}

export function StoryEditorPage({ storyId }: { storyId: number }) {
  const t = useTranslations("TutorStories");
  const router = useRouter();
  const { data: story, isLoading, isError } = useGetTutorPreschoolStory(storyId);

  return (
    <SimplePageContainer title={story?.title ?? t("editTitle")}>
      <div className="mb-2">
        <Breadcrumbs items={[{ label: t("title"), href: "/tutor/stories" }, { label: story?.title ?? t("editTitle") }]} />
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

      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {story && <StoryForm key={story.id} story={story} onDeleted={() => router.replace("/tutor/stories")} />}
    </SimplePageContainer>
  );
}
