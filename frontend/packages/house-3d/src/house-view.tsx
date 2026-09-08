"use client";

import { useTranslations } from "next-intl";
import { useAuthStore } from "@school-ahead/api-client";
import {
  getListFurnitureCatalogQueryKey,
  useListFurnitureCatalog,
  useUpdateFurniturePlacement,
} from "@school-ahead/api-client/browser/house/house";
import { useQueryClient } from "@tanstack/react-query";
import { RoomScene } from "./room-scene";
import { RoomStylePicker, useRoomStyle } from "./room-style-picker";
import { FurnitureShop } from "./furniture-shop";
import { useHouseSceneStore, type GizmoMode } from "./stores/house-scene-store";

// Top-level export: the student's 3D room + furniture market, backed by
// GET /house/furniture (catalog + this student's ownership/placement in
// one call — see house.api.list_furniture_catalog). Owns the data fetch so
// RoomScene/FurnitureShop below stay fetch-agnostic.
//
// Layout follows the app-wide kids/preschool mode (useAuthStore's
// user.interfaceMode, toggled by apps/web's header PreschoolModeToggle —
// not a house-local setting): in that mode there's no Editor Mode toggle,
// no arrows setting, no rotating, and everything's bigger — dragging an
// item just always works. Outside it, this renders the full experience
// with Editor Mode, the arrows setting, and rotating, for a tutor or an
// older student who wants precise control.
export function HouseView() {
  const t = useTranslations("House");
  const queryClient = useQueryClient();
  const { data: items = [], isLoading, isError } = useListFurnitureCatalog();
  const updatePlacement = useUpdateFurniturePlacement();
  const isKidsMode = useAuthStore((state) => state.user?.interfaceMode) === "preschool";
  const isEditorMode = useHouseSceneStore((state) => state.isEditorMode);
  const toggleEditorMode = useHouseSceneStore((state) => state.toggleEditorMode);
  const gizmoMode = useHouseSceneStore((state) => state.gizmoMode);
  const setGizmoMode = useHouseSceneStore((state) => state.setGizmoMode);
  const selectedItemId = useHouseSceneStore((state) => state.selectedItemId);
  const setSelectedItemId = useHouseSceneStore((state) => state.setSelectedItemId);
  const showGizmoArrows = useHouseSceneStore((state) => state.showGizmoArrows);
  const setShowGizmoArrows = useHouseSceneStore((state) => state.setShowGizmoArrows);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const { wallColor, floorColor, setWallColor, setFloorColor } = useRoomStyle();

  // Kids mode never makes a student find and flip "Editor Mode" first —
  // dragging an item just always works. Rotating (and its gizmo/arrows) is
  // the non-kids extra, since there's no simple drag gesture for it.
  const roomIsEditorMode = isKidsMode || isEditorMode;
  const roomShowGizmoArrows = !isKidsMode && showGizmoArrows;

  const handleTransformEnd = (
    itemId: number,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: number,
  ) => {
    updatePlacement.mutate(
      { itemId, data: { position, rotation, scale } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListFurnitureCatalogQueryKey() }) },
    );
  };

  if (isLoading) return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  if (isError) return <p className="p-6 text-sm text-red-600">{t("error")}</p>;

  const gizmoModes: GizmoMode[] = ["translate", "rotate"];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className={isKidsMode ? "text-2xl font-bold text-gray-900" : "text-lg font-semibold text-gray-900"}>
          {isKidsMode ? `🏠 ${t("pageTitle")}` : t("pageTitle")}
        </h1>
        {!isKidsMode && (
          <div className="flex flex-col items-end gap-2">
            {selectedItem && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-gray-700">{t("selectedItem", { name: selectedItem.name })}</span>
                <button
                  type="button"
                  onClick={() => setSelectedItemId(null)}
                  className="rounded-md border border-gray-300 px-2 py-1 font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t("deselect")}
                </button>
              </div>
            )}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                <input
                  type="checkbox"
                  checked={showGizmoArrows}
                  onChange={(e) => setShowGizmoArrows(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                {t("showGizmoArrows")}
              </label>
              <button
                type="button"
                onClick={toggleEditorMode}
                aria-pressed={isEditorMode}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                  isEditorMode
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {isEditorMode ? t("exitEditorMode") : t("editorMode")}
              </button>
            </div>
          </div>
        )}
      </div>

      {items.every((item) => !item.placement) && (
        <p className={isKidsMode ? "text-base text-gray-600" : "text-sm text-gray-500"}>
          {isKidsMode ? t("emptyRoomHintKids") : t("emptyRoomHint")}
        </p>
      )}

      <RoomStylePicker
        wallColor={wallColor}
        floorColor={floorColor}
        onWallColorChange={setWallColor}
        onFloorColorChange={setFloorColor}
      />

      {/* Inline height, not a Tailwind arbitrary-value class: this package's
          classes depend on apps/web's globals.css @source-scanning it, which
          has proven unreliable to pick up after adding a brand-new @source
          path (stale Turbopack cache surviving cache clears/restarts) — an
          inline style can't be silently dropped by that pipeline. */}
      <div
        className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-50"
        style={{ height: "55vh", minHeight: 400 }}
      >
        <RoomScene
          placedItems={items}
          onTransformEnd={handleTransformEnd}
          isEditorMode={roomIsEditorMode}
          showGizmoArrows={roomShowGizmoArrows}
          wallColor={wallColor}
          floorColor={floorColor}
        />
      </div>

      {!isKidsMode && isEditorMode && selectedItemId !== null && showGizmoArrows && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500">{t("dragHint")}</span>
          {gizmoModes.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setGizmoMode(mode)}
              aria-pressed={gizmoMode === mode}
              className={`rounded-md border px-3 py-1 text-xs font-medium ${
                gizmoMode === mode ? "border-gray-900 bg-gray-900/5" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              {t(mode === "translate" ? "modeMove" : "modeRotate")}
            </button>
          ))}
        </div>
      )}

      <FurnitureShop items={items} kidsMode={isKidsMode} />
    </div>
  );
}
