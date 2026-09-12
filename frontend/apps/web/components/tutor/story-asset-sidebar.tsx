"use client";

import { useTranslations } from "next-intl";
import { Check, FileAudio, FileVideo, Trash2 } from "lucide-react";
import {
  getGetTutorPreschoolStoryQueryKey,
  useCreateTutorPreschoolStoryAssets,
  useDeleteTutorPreschoolStoryAsset,
} from "@school-ahead/api-client/browser/preschool/preschool";
import type { StoryAssetOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { useQueryClient } from "@tanstack/react-query";
import { FileDropzone } from "@/components/file-dropzone";

// The syllable-card syntax `{ <ref> }` an asset gets dragged into the text
// as — see frontend's lib/story-parser.ts for the exact grammar (a lone
// image/audio/video reference in a "{...}" group). Set as the drag payload
// so the textarea drop handler (story-markdown-editor.tsx) can splice it in
// verbatim.
export function assetCardText(url: string): string {
  return `{ ${url} }`;
}

const IMAGE_RE = /\.(jpe?g|png|webp|gif)$/i;
const AUDIO_RE = /\.(mp3|wav|ogg|m4a)$/i;

// The little corner badge is the only "used?" signal that doesn't depend on
// reading the row's text label — useful once the sidebar has many assets and
// the tutor is scanning thumbnails rather than filenames.
function UsedBadge({ isUsed, label }: { isUsed: boolean; label: string }) {
  return (
    <span
      title={label}
      aria-hidden="true"
      className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white ${
        isUsed ? "bg-emerald-500" : "bg-gray-300"
      }`}
    >
      {isUsed && <Check className="h-2.5 w-2.5 text-white" />}
    </span>
  );
}

function AssetThumb({ asset, isUsed, usedLabel }: { asset: StoryAssetOut; isUsed: boolean; usedLabel: string }) {
  if (IMAGE_RE.test(asset.url)) {
    return (
      <span className="relative inline-flex shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.url} alt="" className="h-10 w-10 rounded object-cover" />
        <UsedBadge isUsed={isUsed} label={usedLabel} />
      </span>
    );
  }
  const Icon = AUDIO_RE.test(asset.url) ? FileAudio : FileVideo;
  return (
    <span className="relative inline-flex shrink-0">
      <span className="flex h-10 w-10 items-center justify-center rounded bg-gray-100">
        <Icon className="h-4 w-4 text-gray-500" />
      </span>
      <UsedBadge isUsed={isUsed} label={usedLabel} />
    </span>
  );
}

function AssetRow({ storyId, asset, isUsed }: { storyId: number; asset: StoryAssetOut; isUsed: boolean }) {
  const t = useTranslations("TutorStories");
  const queryClient = useQueryClient();
  const deleteAsset = useDeleteTutorPreschoolStoryAsset();

  const handleDelete = () => {
    deleteAsset.mutate(
      { storyId, assetId: asset.id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTutorPreschoolStoryQueryKey(storyId) }) },
    );
  };

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", assetCardText(asset.url));
        e.dataTransfer.effectAllowed = "copy";
      }}
      title={t("dragIntoText")}
      className="flex cursor-grab items-center gap-2 rounded-md border border-gray-200 p-1.5 active:cursor-grabbing"
    >
      <AssetThumb asset={asset} isUsed={isUsed} usedLabel={t(isUsed ? "usedInText" : "notUsedInText")} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium text-gray-700">{asset.original_filename}</span>
        <span className={`text-[10px] ${isUsed ? "text-emerald-600" : "text-gray-400"}`}>
          {t(isUsed ? "usedInText" : "notUsedInText")}
        </span>
      </span>
      <button
        type="button"
        title={t("remove")}
        aria-label={t("remove")}
        onClick={handleDelete}
        disabled={deleteAsset.isPending}
        className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

// The story editor's right-hand sidebar (see story-editor-page.tsx) — every
// image/audio/video uploaded for this story, each draggable straight into
// the content textarea (see story-markdown-editor.tsx's onDrop). Uploading
// takes any number of files at once via FileDropzone's `multiple`.
export function StoryAssetSidebar({
  storyId,
  assets,
  content,
}: {
  storyId: number;
  assets: StoryAssetOut[];
  content: string;
}) {
  const t = useTranslations("TutorStories");
  const queryClient = useQueryClient();
  const createAssets = useCreateTutorPreschoolStoryAssets();

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    createAssets.mutate(
      { storyId, data: { files: Array.from(files) } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetTutorPreschoolStoryQueryKey(storyId) }) },
    );
  };

  return (
    // Sticky + its own scroll so the panel stays fully visible next to a long
    // story (the form column can run well past one screen) instead of
    // scrolling out of view with the rest of the page.
    <div className="flex w-full flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-64 lg:self-start lg:overflow-y-auto">
      <span className="text-xs font-medium text-gray-700">{t("assets")}</span>
      <FileDropzone
        id="story-assets"
        hint={createAssets.isPending ? t("uploadingImage") : t("assetsDropzoneHint")}
        multiple
        accept="image/*,audio/*,video/mp4,video/webm,video/quicktime"
        onFilesSelected={handleFilesSelected}
      />
      {assets.length === 0 ? (
        <p className="text-xs text-gray-500">{t("noAssets")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {assets.map((asset) => (
            <AssetRow key={asset.id} storyId={storyId} asset={asset} isUsed={content.includes(asset.url)} />
          ))}
        </ul>
      )}
    </div>
  );
}
