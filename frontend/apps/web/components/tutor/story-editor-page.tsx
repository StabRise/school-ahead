"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPreschoolStoryQueryKey,
  getListPreschoolStoriesQueryKey,
  useCreatePreschoolStory,
  useCreatePreschoolStoryImage,
  useDeletePreschoolStory,
  useGetPreschoolStory,
  useUpdatePreschoolStory,
} from "@school-ahead/api-client/browser/preschool/preschool";
import type { StoryDetailOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { useRouter } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SimplePageContainer } from "@/components/simple/page-container";
import { FileDropzone } from "@/components/file-dropzone";
import { StoryMarkdownEditor } from "@/components/tutor/story-markdown-editor";

// Local form state is seeded from `story` once on mount, same convention as
// tutor-lesson-detail-page.tsx's LessonEditForm — the caller below mounts
// this fresh (via `key`) once the story to edit has loaded, or immediately
// in create mode, so there's no need for an effect/guard to re-seed it.
function StoryForm({
  story,
  onSaved,
  onDeleted,
}: {
  story: StoryDetailOut | null;
  onSaved: (id: number) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("TutorStories");
  const queryClient = useQueryClient();
  const isEdit = story !== null;
  const createStory = useCreatePreschoolStory();
  const updateStory = useUpdatePreschoolStory();
  const deleteStory = useDeletePreschoolStory();
  const createStoryImage = useCreatePreschoolStoryImage();
  const mutation = isEdit ? updateStory : createStory;

  const [title, setTitle] = useState(story?.title ?? "");
  const [subtitle, setSubtitle] = useState(story?.subtitle ?? "");
  const [content, setContent] = useState(story?.content ?? "");
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { title, subtitle, content, ...(coverFile ? { cover_image: coverFile } : {}) };

    if (isEdit) {
      updateStory.mutate(
        { storyId: story.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPreschoolStoriesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetPreschoolStoryQueryKey(story.id) });
            onSaved(story.id);
          },
        },
      );
    } else {
      createStory.mutate(
        { data },
        {
          onSuccess: (created) => {
            queryClient.invalidateQueries({ queryKey: getListPreschoolStoriesQueryKey() });
            onSaved(created.id);
          },
        },
      );
    }
  };

  const handleDelete = () => {
    if (!story) return;
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

  const handleUploadImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      if (!story) {
        reject(new Error("story must be saved before images can be inserted"));
        return;
      }
      createStoryImage.mutate(
        { storyId: story.id, data: { image: file } },
        { onSuccess: (asset) => resolve(asset.url), onError: reject },
      );
    });

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="story-title" className="text-xs font-medium text-gray-700">
          {t("storyTitle")}
        </label>
        <input
          id="story-title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
          onChange={(e) => setSubtitle(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-700">{t("coverImage")}</span>
        <div className="flex items-center gap-3">
          {story?.cover_image && !coverFile && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={story.cover_image} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
          )}
          <FileDropzone
            id="story-cover"
            hint={t("dropzoneHint")}
            multiple={false}
            onFilesSelected={(files) => setCoverFile(files?.[0] ?? null)}
          />
        </div>
        {coverFile && <p className="text-xs text-gray-500">{coverFile.name}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-700">{t("content")}</span>
        <StoryMarkdownEditor
          value={content}
          onChange={setContent}
          previewSlug={isEdit ? `story-${story.id}` : "preview"}
          onUploadImage={isEdit ? handleUploadImage : undefined}
          rows={14}
        />
        {!isEdit && <p className="text-xs text-gray-500">{t("insertImageAfterCreate")}</p>}
      </div>

      {mutation.isError && <p className="text-sm text-red-600">{t("saveError")}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!title.trim() || mutation.isPending}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("saveButton")}
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteStory.isPending}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {t("remove")}
          </button>
        )}
      </div>
    </form>
  );
}

export function StoryEditorPage({ storyId }: { storyId: number | null }) {
  const t = useTranslations("TutorStories");
  const router = useRouter();
  const isEdit = storyId !== null;
  const { data: story, isLoading, isError } = useGetPreschoolStory(storyId ?? -1, { query: { enabled: isEdit } });

  return (
    <SimplePageContainer title={isEdit ? t("editTitle") : t("createTitle")}>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: t("title"), href: "/tutor/stories" },
            { label: isEdit ? (story?.title ?? t("editTitle")) : t("createTitle") },
          ]}
        />
      </div>

      {isEdit && isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isEdit && isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {(!isEdit || story) && (
        <StoryForm
          key={story?.id ?? "new"}
          story={story ?? null}
          // Only navigate away after creating a brand-new story (to its own
          // edit page, so images can now be inserted) — saving an existing
          // one just stays put, the refetched data quietly backs the form.
          onSaved={(id) => {
            if (!isEdit) router.replace(`/tutor/stories/${id}`);
          }}
          onDeleted={() => router.replace("/tutor/stories")}
        />
      )}
    </SimplePageContainer>
  );
}
