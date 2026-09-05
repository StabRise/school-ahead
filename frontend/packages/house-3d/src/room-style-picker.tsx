"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getGetRoomStyleQueryKey, useGetRoomStyle, useUpdateRoomStyle } from "@school-ahead/api-client/browser/house/house";
import type { UpdateRoomStyleIn } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { DEFAULT_FLOOR_COLOR, DEFAULT_WALL_COLOR } from "./lib/room-constants";

// How long to wait after the student's last color pick before actually
// PATCHing — native <input type="color"> fires a change event per
// intermediate hue while some browsers' picker popup stays open, and a
// raw per-tick PATCH would spam the API for what is, to the student, one
// single pick.
const SAVE_DEBOUNCE_MS = 400;

// Fetches the student's saved room colors (house.models.RoomStyle) and
// exposes a debounced setter for each. house-view.tsx wires the result to
// both RoomScene (instant local-state visual feedback, no round-trip
// needed to see the new color) and RoomStylePicker (the swatches), so
// they never disagree about the current color.
export function useRoomStyle() {
  const queryClient = useQueryClient();
  const { data } = useGetRoomStyle();
  const updateRoomStyle = useUpdateRoomStyle();

  // The student's own not-yet-confirmed pick, if any — takes precedence
  // over `data` rather than being synced from it, so a color pick shows up
  // instantly without waiting on the debounced PATCH/refetch round-trip,
  // and a slower-arriving GET response can never stomp on a color the
  // student already changed their mind about again in the meantime.
  const [wallOverride, setWallOverride] = useState<string | null>(null);
  const [floorOverride, setFloorOverride] = useState<string | null>(null);
  const wallColor = wallOverride ?? data?.wall_color ?? DEFAULT_WALL_COLOR;
  const floorColor = floorOverride ?? data?.floor_color ?? DEFAULT_FLOOR_COLOR;

  // Merged into (not replaced by) whatever's already pending, so picking
  // the wall color and then the floor color in quick succession — inside
  // the same debounce window — still saves both, not just the second one.
  const pendingPatch = useRef<UpdateRoomStyleIn>({});
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
  }, []);

  const scheduleSave = (patch: UpdateRoomStyleIn) => {
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      const toSave = pendingPatch.current;
      pendingPatch.current = {};
      updateRoomStyle.mutate(
        { data: toSave },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetRoomStyleQueryKey() }) },
      );
    }, SAVE_DEBOUNCE_MS);
  };

  return {
    wallColor,
    floorColor,
    setWallColor: (color: string) => {
      setWallOverride(color);
      scheduleSave({ wall_color: color });
    },
    setFloorColor: (color: string) => {
      setFloorOverride(color);
      scheduleSave({ floor_color: color });
    },
  };
}

export interface RoomStylePickerProps {
  wallColor: string;
  floorColor: string;
  onWallColorChange: (color: string) => void;
  onFloorColorChange: (color: string) => void;
}

// Two native color swatches for the student's wall/floor pick — house-view.tsx
// owns the actual fetch/local state (useRoomStyle above) and RoomScene's live
// rendering; this is just the inputs.
export function RoomStylePicker({ wallColor, floorColor, onWallColorChange, onFloorColorChange }: RoomStylePickerProps) {
  const t = useTranslations("House");
  return (
    <div className="flex items-center gap-4">
      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
        {t("wallColor")}
        <input
          type="color"
          value={wallColor}
          onChange={(e) => onWallColorChange(e.target.value)}
          aria-label={t("wallColor")}
          className="h-7 w-7 cursor-pointer rounded border border-gray-300 p-0"
        />
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
        {t("floorColor")}
        <input
          type="color"
          value={floorColor}
          onChange={(e) => onFloorColorChange(e.target.value)}
          aria-label={t("floorColor")}
          className="h-7 w-7 cursor-pointer rounded border border-gray-300 p-0"
        />
      </label>
    </div>
  );
}
