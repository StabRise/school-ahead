"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPreschoolStoryQueryKey,
  getListPreschoolStoriesQueryKey,
  useCreatePreschoolStory,
  useCreatePreschoolStoryImage,
  useDeletePreschoolStory,
  useGetPreschoolStory,
  useListPreschoolStories,
  useUpdatePreschoolStory,
} from "@school-ahead/api-client/browser/preschool/preschool";
import type { StoryOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { PageContainer } from "@/components/page-container";
import { StoryMarkdownEditor } from "@/components/tutor/story-markdown-editor";

interface StoryDraft {
  title: string;
  subtitle: string;
  content: string;
}

function draftFromStory(story: { title: string; subtitle: string; content: string }): StoryDraft {
  return { title: story.title, subtitle: story.subtitle, content: story.content };
}

function StoryThumb({ story }: { story: StoryOut }) {
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
      {story.cover_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={story.cover_image} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true" className="text-xl">
          📖
        </span>
      )}
    </span>
  );
}

export function TutorStoriesPage() {
  const t = useTranslations("TutorStories");
  const queryClient = useQueryClient();
  const { data: stories, isLoading, isError } = useListPreschoolStories();
  const createStory = useCreatePreschoolStory();
  const updateStory = useUpdatePreschoolStory();
  const deleteStory = useDeletePreschoolStory();
  const createStoryImage = useCreatePreschoolStoryImage();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: story } = useGetPreschoolStory(selectedId ?? -1, { query: { enabled: selectedId !== null } });

  const [draft, setDraft] = useState<StoryDraft>({ title: "", subtitle: "", content: "" });
  const [newTitle, setNewTitle] = useState("");
  const coverFileRef = useRef<HTMLInputElement>(null);

  // Re-seed the draft when the selected story's detail loads, mirroring
  // tutor-furniture-editor-page.tsx's pattern (state update during render,
  // guarded by comparing against the last-seen id, instead of an effect).
  const [lastStoryId, setLastStoryId] = useState<number | null>(null);
  if ((story?.id ?? null) !== lastStoryId) {
    setLastStoryId(story?.id ?? null);
    if (story) setDraft(draftFromStory(story));
  }

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: getListPreschoolStoriesQueryKey() });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createStory.mutate(
      { data: { title: newTitle.trim() } },
      {
        onSuccess: (created) => {
          setNewTitle("");
          setSelectedId(created.id);
          invalidateList();
        },
      },
    );
  };

  const handleSave = () => {
    if (!story) return;
    const coverImage = coverFileRef.current?.files?.[0] ?? null;
    updateStory.mutate(
      {
        storyId: story.id,
        data: {
          title: draft.title,
          subtitle: draft.subtitle,
          content: draft.content,
          ...(coverImage ? { cover_image: coverImage } : {}),
        },
      },
      {
        onSuccess: () => {
          if (coverFileRef.current) coverFileRef.current.value = "";
          invalidateList();
          queryClient.invalidateQueries({ queryKey: getGetPreschoolStoryQueryKey(story.id) });
        },
      },
    );
  };

  const handleDelete = () => {
    if (!story) return;
    if (!window.confirm(t("confirmDelete", { title: story.title }))) return;
    deleteStory.mutate(
      { storyId: story.id },
      {
        onSuccess: () => {
          setSelectedId(null);
          invalidateList();
        },
      },
    );
  };

  const handleUploadImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      if (!story) {
        reject(new Error("no story selected"));
        return;
      }
      createStoryImage.mutate(
        { storyId: story.id, data: { image: file } },
        { onSuccess: (asset) => resolve(asset.url), onError: reject },
      );
    });

  return (
    <PageContainer title={t("title")}>
      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {stories && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {stories.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setSelectedId(candidate.id)}
                  aria-pressed={candidate.id === selectedId}
                  title={candidate.title}
                  className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
                    candidate.id === selectedId
                      ? "border-gray-900 bg-gray-900/5"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <StoryThumb story={candidate} />
                  <span className="flex flex-col text-sm">
                    <span className="font-medium text-gray-700">{candidate.title}</span>
                    {candidate.subtitle && <span className="text-xs text-gray-500">{candidate.subtitle}</span>}
                  </span>
                </button>
              ))}
              {stories.length === 0 && <p className="text-sm text-gray-500">{t("empty")}</p>}
            </div>

            {story && (
              <div className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-700">{t("storyTitle")}</span>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    className="rounded-md border border-gray-300 px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-700">{t("subtitle")}</span>
                  <input
                    type="text"
                    value={draft.subtitle}
                    onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))}
                    className="rounded-md border border-gray-300 px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-700">{t("coverImage")}</span>
                  <div className="flex items-center gap-2">
                    {story.cover_image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={story.cover_image} alt="" className="h-12 w-12 rounded-md object-cover" />
                    )}
                    <input ref={coverFileRef} type="file" accept="image/*" className="text-xs" />
                  </div>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-700">{t("content")}</span>
                  <StoryMarkdownEditor
                    value={draft.content}
                    onChange={(content) => setDraft((d) => ({ ...d, content }))}
                    previewSlug={`story-${story.id}`}
                    onUploadImage={handleUploadImage}
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={updateStory.isPending}
                    className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {t("save")}
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleteStory.isPending}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    {t("remove")}
                  </button>
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={handleCreate}
            className="flex w-full flex-col gap-3 rounded-lg border border-gray-200 p-4 lg:w-80"
          >
            <h3 className="text-sm font-semibold text-gray-900">{t("newStoryTitle")}</h3>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-700">{t("storyTitle")}</span>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <button
              type="submit"
              disabled={createStory.isPending}
              className="self-start rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {t("create")}
            </button>
          </form>
        </div>
      )}
    </PageContainer>
  );
}
