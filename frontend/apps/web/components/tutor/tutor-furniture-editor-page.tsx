"use client";

import { useRef, useState } from "react";
import { isAxiosError } from "axios";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListTutorFurnitureQueryKey,
  useAddTutorFurnitureTextures,
  useCreateTutorFurnitureItem,
  useDeleteTutorFurnitureItem,
  useDeleteTutorFurnitureTexture,
  useListTutorFurniture,
  useUpdateTutorFurnitureItem,
} from "@school-ahead/api-client/browser/tutor/tutor";
import type { TutorFurnitureItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { FurniturePreview, type FurnitureKind, type FurnitureSurface } from "@school-ahead/house-3d";
import { PageContainer } from "@/components/page-container";
import { AvatarEditorSlider } from "@/components/tutor/avatar-editor-slider";

const SCALE_RANGE = { min: 0.1, max: 5, step: 0.05 };
const ROTATION_RANGE = { min: -Math.PI, max: Math.PI, step: 0.01 };
const PRICE_RANGE = { min: 0, max: 500, step: 5 };
// A "little move", not free placement — matches house-3d's
// lib/surface.ts::MAX_SURFACE_OFFSET, which clamps a floor/ceiling item's y
// to this same range. Fixes a model whose own pivot isn't at its base, so
// it looks sunk into the floor (or floating off the ceiling/wall) at the
// catalog default.
const POSITION_RANGE = { min: -0.5, max: 0.5, step: 0.01 };
const SURFACES: FurnitureSurface[] = ["floor", "wall", "ceiling"];
const KINDS: FurnitureKind[] = ["normal", "with_hole"];
// Common angles a tutor is likely to want exactly, not just "close to" —
// the slider's 0.01 step can't reliably land on these. Kept within the
// slider's own [-180°, 180°] range (equivalent angles beyond that, e.g.
// 225° / -135°, are the same rotation either way).
const QUICK_ANGLES_DEG = [-135, -90, -45, 0, 45, 90, 135, 180];

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function isCloseTo(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

interface ItemDraft {
  price: number;
  surface: FurnitureSurface;
  kind: FurnitureKind;
  scale: number;
  positionX: number;
  positionY: number;
  positionZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
}

interface UploadDraft {
  key: string;
  name: string;
  price: number;
  surface: FurnitureSurface;
  kind: FurnitureKind;
}

function draftFromItem(item: TutorFurnitureItemOut): ItemDraft {
  return {
    price: item.price,
    surface: item.surface as FurnitureSurface,
    kind: item.kind as FurnitureKind,
    scale: item.default_scale,
    positionX: item.default_position[0] ?? 0,
    positionY: item.default_position[1] ?? 0,
    positionZ: item.default_position[2] ?? 0,
    rotationX: item.default_rotation[0] ?? 0,
    rotationY: item.default_rotation[1] ?? 0,
    rotationZ: item.default_rotation[2] ?? 0,
  };
}

// Snap-to-exact-angle shortcuts sitting under a rotation slider — the
// slider itself stays free-form (fine adjustment), these jump straight to
// a common angle like 45°/90°/180° that's otherwise fiddly to land on with
// a 0.01-radian step.
function QuickAngleButtons({ value, onChange }: { value: number; onChange: (radians: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {QUICK_ANGLES_DEG.map((deg) => {
        const radians = degToRad(deg);
        const isActive = isCloseTo(value, radians);
        return (
          <button
            key={deg}
            type="button"
            onClick={() => onChange(radians)}
            aria-pressed={isActive}
            className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${
              isActive
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {deg}°
          </button>
        );
      })}
    </div>
  );
}

function FurnitureThumb({ item }: { item: TutorFurnitureItemOut }) {
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.thumbnail_image} alt="" className="h-full w-full object-contain" />
    </span>
  );
}

export function TutorFurnitureEditorPage() {
  const t = useTranslations("TutorFurnitureEditor");
  const queryClient = useQueryClient();
  const { data: items, isLoading, isError } = useListTutorFurniture();
  const createItem = useCreateTutorFurnitureItem();
  const updateItem = useUpdateTutorFurnitureItem();
  const deleteItem = useDeleteTutorFurnitureItem();
  const addTextures = useAddTutorFurnitureTextures();
  const deleteTexture = useDeleteTutorFurnitureTexture();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [itemDraft, setItemDraft] = useState<ItemDraft>({
    price: 0,
    surface: "floor",
    kind: "normal",
    scale: 1,
    positionX: 0,
    positionY: 0,
    positionZ: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
  });
  const [uploadDraft, setUploadDraft] = useState<UploadDraft>({
    key: "", name: "", price: 0, surface: "floor", kind: "normal",
  });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const modelFileRef = useRef<HTMLInputElement>(null);
  const thumbnailFileRef = useRef<HTMLInputElement>(null);
  const textureFilesRef = useRef<HTMLInputElement>(null);
  const materialFileRef = useRef<HTMLInputElement>(null);
  const addTextureFilesRef = useRef<HTMLInputElement>(null);

  const item = items?.find((i) => i.id === selectedId) ?? null;

  // Re-seed the draft when the selection changes, mirroring
  // tutor-avatar-editor-page.tsx's pattern (state update during render,
  // guarded by comparing against the last-seen id, instead of an effect).
  const [lastItemId, setLastItemId] = useState<number | null>(null);
  if ((item?.id ?? null) !== lastItemId) {
    setLastItemId(item?.id ?? null);
    if (item) setItemDraft(draftFromItem(item));
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTutorFurnitureQueryKey() });

  const handleSelect = (id: number) => setSelectedId(id);

  const handleSave = () => {
    if (!item) return;
    updateItem.mutate(
      {
        itemId: item.id,
        data: {
          price: itemDraft.price,
          surface: itemDraft.surface,
          kind: itemDraft.kind,
          default_scale: itemDraft.scale,
          default_rotation: [itemDraft.rotationX, itemDraft.rotationY, itemDraft.rotationZ],
          default_position: [itemDraft.positionX, itemDraft.positionY, itemDraft.positionZ],
        },
      },
      { onSuccess: invalidate },
    );
  };

  const handleDelete = () => {
    if (!item) return;
    if (!window.confirm(t("confirmDelete", { name: item.name }))) return;
    deleteItem.mutate(
      { itemId: item.id },
      {
        onSuccess: () => {
          setSelectedId(null);
          invalidate();
        },
      },
    );
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    const modelFile = modelFileRef.current?.files?.[0];
    const thumbnailFile = thumbnailFileRef.current?.files?.[0];
    if (!modelFile || !thumbnailFile) {
      setUploadError(t("uploadMissingFiles"));
      return;
    }
    createItem.mutate(
      {
        data: {
          key: uploadDraft.key,
          name: uploadDraft.name,
          price: uploadDraft.price,
          surface: uploadDraft.surface,
          kind: uploadDraft.kind,
          model_file: modelFile,
          thumbnail_image: thumbnailFile,
          texture_files: Array.from(textureFilesRef.current?.files ?? []),
          material_file: materialFileRef.current?.files?.[0] ?? null,
        },
      },
      {
        onSuccess: () => {
          setUploadDraft({ key: "", name: "", price: 0, surface: "floor", kind: "normal" });
          if (modelFileRef.current) modelFileRef.current.value = "";
          if (thumbnailFileRef.current) thumbnailFileRef.current.value = "";
          if (textureFilesRef.current) textureFilesRef.current.value = "";
          if (materialFileRef.current) materialFileRef.current.value = "";
          invalidate();
        },
        onError: (error) => {
          if (isAxiosError(error) && error.response?.status === 409) {
            setUploadError(t("uploadDuplicateKey"));
          } else if (isAxiosError(error) && error.response?.status === 400) {
            setUploadError(t("uploadInvalidFile"));
          } else {
            setUploadError(t("uploadFailed"));
          }
        },
      },
    );
  };

  const handleAddTextures = () => {
    if (!item) return;
    const files = Array.from(addTextureFilesRef.current?.files ?? []);
    if (files.length === 0) return;
    addTextures.mutate(
      { itemId: item.id, data: { texture_files: files } },
      {
        onSuccess: () => {
          if (addTextureFilesRef.current) addTextureFilesRef.current.value = "";
          invalidate();
        },
      },
    );
  };

  const handleDeleteTexture = (textureId: number) => {
    if (!item) return;
    deleteTexture.mutate({ itemId: item.id, textureId }, { onSuccess: invalidate });
  };

  return (
    <PageContainer title={t("title")}>
      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {items && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {items.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => handleSelect(candidate.id)}
                  aria-pressed={candidate.id === selectedId}
                  title={candidate.name}
                  className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
                    candidate.id === selectedId
                      ? "border-gray-900 bg-gray-900/5"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  } ${candidate.is_active ? "" : "opacity-50"}`}
                >
                  <FurnitureThumb item={candidate} />
                  <span className="flex flex-col text-sm">
                    <span className="font-medium text-gray-700">{candidate.name}</span>
                    <span className="text-xs text-gray-500">💎{candidate.price}</span>
                  </span>
                </button>
              ))}
              {items.length === 0 && <p className="text-sm text-gray-500">{t("empty")}</p>}
            </div>

            {item && (
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="aspect-square w-full shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 sm:w-64">
                  <FurniturePreview
                    modelUrl={item.model_file}
                    modelFormat={item.model_format === "stl" ? "stl" : "obj"}
                    materialUrl={item.material_file}
                    textures={item.textures}
                    surface={itemDraft.surface}
                    scale={itemDraft.scale}
                    position={[itemDraft.positionX, itemDraft.positionY, itemDraft.positionZ]}
                    rotation={[itemDraft.rotationX, itemDraft.rotationY, itemDraft.rotationZ]}
                  />
                </div>

                <div className="flex flex-1 flex-col gap-3 rounded-lg border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">{item.name}</h3>
                  <AvatarEditorSlider
                    label={t("price")}
                    value={itemDraft.price}
                    {...PRICE_RANGE}
                    decimals={0}
                    onChange={(price) => setItemDraft((d) => ({ ...d, price }))}
                  />
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-gray-700">{t("surface")}</span>
                    <select
                      value={itemDraft.surface}
                      onChange={(e) => setItemDraft((d) => ({ ...d, surface: e.target.value as FurnitureSurface }))}
                      className="rounded-md border border-gray-300 px-2 py-1"
                    >
                      {SURFACES.map((surface) => (
                        <option key={surface} value={surface}>
                          {t(`surfaceOption.${surface}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-gray-700">{t("kind")}</span>
                    <select
                      value={itemDraft.kind}
                      onChange={(e) => setItemDraft((d) => ({ ...d, kind: e.target.value as FurnitureKind }))}
                      className="rounded-md border border-gray-300 px-2 py-1"
                    >
                      {KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {t(`kindOption.${kind}`)}
                        </option>
                      ))}
                    </select>
                    {itemDraft.kind === "with_hole" && <span className="text-xs text-gray-500">{t("kindHint")}</span>}
                  </label>
                  <AvatarEditorSlider
                    label={t("scale")}
                    value={itemDraft.scale}
                    {...SCALE_RANGE}
                    onChange={(scale) => setItemDraft((d) => ({ ...d, scale }))}
                  />
                  <p className="text-xs text-gray-500">{t("positionHint")}</p>
                  <AvatarEditorSlider
                    label={t("positionX")}
                    value={itemDraft.positionX}
                    {...POSITION_RANGE}
                    onChange={(positionX) => setItemDraft((d) => ({ ...d, positionX }))}
                  />
                  <AvatarEditorSlider
                    label={t("positionY")}
                    value={itemDraft.positionY}
                    {...POSITION_RANGE}
                    onChange={(positionY) => setItemDraft((d) => ({ ...d, positionY }))}
                  />
                  <AvatarEditorSlider
                    label={t("positionZ")}
                    value={itemDraft.positionZ}
                    {...POSITION_RANGE}
                    onChange={(positionZ) => setItemDraft((d) => ({ ...d, positionZ }))}
                  />
                  <div className="flex flex-col gap-1">
                    <AvatarEditorSlider
                      label={t("rotationX")}
                      value={itemDraft.rotationX}
                      {...ROTATION_RANGE}
                      onChange={(rotationX) => setItemDraft((d) => ({ ...d, rotationX }))}
                    />
                    <QuickAngleButtons
                      value={itemDraft.rotationX}
                      onChange={(rotationX) => setItemDraft((d) => ({ ...d, rotationX }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <AvatarEditorSlider
                      label={t("rotationZ")}
                      value={itemDraft.rotationZ}
                      {...ROTATION_RANGE}
                      onChange={(rotationZ) => setItemDraft((d) => ({ ...d, rotationZ }))}
                    />
                    <QuickAngleButtons
                      value={itemDraft.rotationZ}
                      onChange={(rotationZ) => setItemDraft((d) => ({ ...d, rotationZ }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <AvatarEditorSlider
                      label={t("rotationY")}
                      value={itemDraft.rotationY}
                      {...ROTATION_RANGE}
                      onChange={(rotationY) => setItemDraft((d) => ({ ...d, rotationY }))}
                    />
                    <QuickAngleButtons
                      value={itemDraft.rotationY}
                      onChange={(rotationY) => setItemDraft((d) => ({ ...d, rotationY }))}
                    />
                  </div>

                  <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
                    <span className="text-sm font-medium text-gray-700">{t("textures")}</span>
                    {item.textures.length === 0 && <p className="text-xs text-gray-500">{t("noTextures")}</p>}
                    {item.textures.length > 0 && (
                      <ul className="flex flex-col gap-1">
                        {item.textures.map((texture) => (
                          <li key={texture.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate text-gray-600">{texture.filename}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteTexture(texture.id)}
                              disabled={deleteTexture.isPending}
                              className="shrink-0 text-red-600 hover:underline disabled:opacity-60"
                            >
                              {t("removeTexture")}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex items-center gap-2">
                      <input ref={addTextureFilesRef} type="file" accept="image/*" multiple className="text-xs" />
                      <button
                        type="button"
                        onClick={handleAddTextures}
                        disabled={addTextures.isPending}
                        className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        {t("addTexture")}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={updateItem.isPending}
                      className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {t("save")}
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleteItem.isPending}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      {t("remove")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={handleUpload}
            className="flex w-full flex-col gap-3 rounded-lg border border-gray-200 p-4 lg:w-80"
          >
            <h3 className="text-sm font-semibold text-gray-900">{t("uploadTitle")}</h3>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-700">{t("key")}</span>
              <input
                type="text"
                required
                value={uploadDraft.key}
                onChange={(e) => setUploadDraft((d) => ({ ...d, key: e.target.value }))}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-700">{t("name")}</span>
              <input
                type="text"
                required
                value={uploadDraft.name}
                onChange={(e) => setUploadDraft((d) => ({ ...d, name: e.target.value }))}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-700">{t("price")}</span>
              <input
                type="number"
                min={0}
                value={uploadDraft.price}
                onChange={(e) => setUploadDraft((d) => ({ ...d, price: Number(e.target.value) }))}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-700">{t("surface")}</span>
              <select
                value={uploadDraft.surface}
                onChange={(e) => setUploadDraft((d) => ({ ...d, surface: e.target.value as FurnitureSurface }))}
                className="rounded-md border border-gray-300 px-2 py-1"
              >
                {SURFACES.map((surface) => (
                  <option key={surface} value={surface}>
                    {t(`surfaceOption.${surface}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-700">{t("kind")}</span>
              <select
                value={uploadDraft.kind}
                onChange={(e) => setUploadDraft((d) => ({ ...d, kind: e.target.value as FurnitureKind }))}
                className="rounded-md border border-gray-300 px-2 py-1"
              >
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`kindOption.${kind}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-700">{t("modelFile")}</span>
              <input ref={modelFileRef} type="file" accept=".obj,.stl" required />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-700">{t("thumbnailImage")}</span>
              <input ref={thumbnailFileRef} type="file" accept="image/*" required />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-700">{t("materialFile")}</span>
              <input ref={materialFileRef} type="file" accept=".mtl" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-700">{t("textureFiles")}</span>
              <input ref={textureFilesRef} type="file" accept="image/*" multiple />
            </label>
            {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
            <button
              type="submit"
              disabled={createItem.isPending}
              className="self-start rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {t("upload")}
            </button>
          </form>
        </div>
      )}
    </PageContainer>
  );
}
