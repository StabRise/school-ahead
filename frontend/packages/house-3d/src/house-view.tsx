"use client";

import { useTranslations } from "next-intl";
import {
  getListFurnitureCatalogQueryKey,
  useListFurnitureCatalog,
  useUpdateFurniturePlacement,
} from "@school-ahead/api-client/browser/house/house";
import { useQueryClient } from "@tanstack/react-query";
import { RoomScene } from "./room-scene";
import { FurnitureShop } from "./furniture-shop";
import { useHouseSceneStore, type GizmoMode } from "./stores/house-scene-store";

// Top-level export: the student's 3D room + furniture shop, backed by
// GET /house/furniture (catalog + this student's ownership/placement in
// one call — see house.api.list_furniture_catalog). Owns the data fetch so
// RoomScene/FurnitureShop below stay fetch-agnostic.
export function HouseView() {
  const t = useTranslations("House");
  const queryClient = useQueryClient();
  const { data: items = [], isLoading, isError } = useListFurnitureCatalog();
  const updatePlacement = useUpdateFurniturePlacement();
  const gizmoMode = useHouseSceneStore((state) => state.gizmoMode);
  const setGizmoMode = useHouseSceneStore((state) => state.setGizmoMode);
  const selectedItemId = useHouseSceneStore((state) => state.selectedItemId);

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
      <h1 className="text-lg font-semibold text-gray-900">{t("pageTitle")}</h1>
      {items.every((item) => !item.placement) && <p className="text-sm text-gray-500">{t("emptyRoomHint")}</p>}

      {/* Inline height, not a Tailwind arbitrary-value class: this package's
          classes depend on apps/web's globals.css @source-scanning it, which
          has proven unreliable to pick up after adding a brand-new @source
          path (stale Turbopack cache surviving cache clears/restarts) — an
          inline style can't be silently dropped by that pipeline. */}
      <div
        className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-50"
        style={{ height: "55vh", minHeight: 400 }}
      >
        <RoomScene placedItems={items} onTransformEnd={handleTransformEnd} />
      </div>

      {selectedItemId !== null && (
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

      <FurnitureShop items={items} />
    </div>
  );
}
