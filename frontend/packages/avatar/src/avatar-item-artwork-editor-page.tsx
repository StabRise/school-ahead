"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListTutorAvatarsQueryKey,
  useListTutorAvatars,
  useUpdateTutorAvatarItemArtwork,
} from "@school-ahead/api-client/browser/tutor/tutor";
import { SvgArtworkEditor, type SvgArtworkEditorHandle } from "./svg-artwork-editor";

// The tutor's graphical touch-up editor for one wardrobe item's SVG artwork
// (reached from TutorAvatarEditorPage's "edit artwork" button) — a real
// drawing/editing canvas (SvgArtworkEditor, wrapping the svgedit library),
// not the scale/offset/rotation placement fine-tuning that page's own
// AvatarPlacementEditor does. Loads the item's *current* image (a plain
// fetch of its URL — it's always same-origin/CORS-open media, already
// served for the `<img>` tags every avatar display uses) as the editor's
// starting document, and on Save PATCHes the whole edited SVG back,
// overwriting AvatarItem.image outright (see
// update_tutor_avatar_item_artwork on the backend).
export function AvatarItemArtworkEditorPage({ itemId, onSaved }: { itemId: number; onSaved?: () => void }) {
  const t = useTranslations("TutorAvatarEditor");
  const queryClient = useQueryClient();
  const { data: avatars, isLoading, isError } = useListTutorAvatars();
  const updateArtwork = useUpdateTutorAvatarItemArtwork();

  const item = avatars?.flatMap((avatar) => avatar.items ?? []).find((candidate) => candidate.id === itemId) ?? null;

  const [svgText, setSvgText] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const editorHandleRef = useRef<SvgArtworkEditorHandle | null>(null);

  useEffect(() => {
    if (!item?.image) return;
    let cancelled = false;
    fetch(item.image)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
      })
      .then((text) => {
        if (!cancelled) setSvgText(text);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [item?.image]);

  // The editor (async module load + init) and the artwork fetch above race
  // independently — whichever finishes second is the one that actually
  // loads the starting document into the canvas.
  useEffect(() => {
    if (svgText && editorHandleRef.current) editorHandleRef.current.loadSvgString(svgText);
  }, [svgText]);

  const handleEditorReady = (handle: SvgArtworkEditorHandle) => {
    editorHandleRef.current = handle;
    if (svgText) handle.loadSvgString(svgText);
  };

  const handleSave = () => {
    if (!editorHandleRef.current) return;
    const svg = editorHandleRef.current.getSvgString();
    updateArtwork.mutate(
      { itemId, data: { svg } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTutorAvatarsQueryKey() });
          onSaved?.();
        },
      },
    );
  };

  if (isLoading) return <p className="text-sm text-gray-500">{t("loading")}</p>;
  if (isError || !item) return <p className="text-sm text-red-600">{t("error")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{item.name}</h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={updateArtwork.isPending}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {t("save")}
        </button>
      </div>
      {(loadError || updateArtwork.isError) && <p className="text-sm text-red-600">{t("error")}</p>}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <SvgArtworkEditor onReady={handleEditorReady} />
      </div>
    </div>
  );
}
