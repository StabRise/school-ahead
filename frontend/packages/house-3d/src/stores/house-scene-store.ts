import { create } from "zustand";

export type GizmoMode = "translate" | "rotate";

interface HouseSceneState {
  selectedItemId: number | null;
  setSelectedItemId: (id: number | null) => void;
  isShopOpen: boolean;
  setShopOpen: (open: boolean) => void;
  gizmoMode: GizmoMode;
  setGizmoMode: (mode: GizmoMode) => void;
}

// Ephemeral, client-only scene UI state — which item's TransformControls
// gizmo is showing (and in which mode), whether the shop panel is open.
// Never persisted, never server data — same minimal shape as
// apps/web/stores/avatar-tryon-store.ts.
export const useHouseSceneStore = create<HouseSceneState>((set) => ({
  selectedItemId: null,
  setSelectedItemId: (id) => set({ selectedItemId: id }),
  isShopOpen: false,
  setShopOpen: (open) => set({ isShopOpen: open }),
  gizmoMode: "translate",
  setGizmoMode: (mode) => set({ gizmoMode: mode }),
}));
