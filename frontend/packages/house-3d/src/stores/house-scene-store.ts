import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GizmoMode = "translate" | "rotate";

interface HouseSceneState {
  // Whether the room is interactive at all — outside Editor Mode, clicking
  // furniture does nothing (a clean view); the house-view.tsx "Editor Mode"
  // / "Exit Editor Mode" button toggles this. Not persisted: every visit
  // starts back in plain view mode.
  isEditorMode: boolean;
  toggleEditorMode: () => void;
  selectedItemId: number | null;
  setSelectedItemId: (id: number | null) => void;
  isShopOpen: boolean;
  setShopOpen: (open: boolean) => void;
  gizmoMode: GizmoMode;
  setGizmoMode: (mode: GizmoMode) => void;
  // Whether the TransformControls gizmo (translate arrows / rotate rings)
  // is drawn over a selected item — a page setting the student toggles
  // themselves (house-view.tsx), off by default. Moving an item by
  // dragging it directly always works regardless of this (see
  // furniture-mesh.tsx's own pointer-drag handling); this only gates the
  // gizmo's visuals (and, for rotate, its only control surface, since
  // there's no direct-drag equivalent for spinning an object). Persisted
  // (unlike the rest of this store) so the choice survives a reload — see
  // the `persist` wrapper below.
  showGizmoArrows: boolean;
  setShowGizmoArrows: (show: boolean) => void;
}

// Mostly ephemeral, client-only scene UI state — whether Editor Mode is on,
// which item's gizmo is showing (and in which mode), whether the shop panel
// is open — same minimal shape as apps/web/stores/avatar-tryon-store.ts.
// showGizmoArrows is the one exception, persisted to localStorage via
// zustand's `persist` (partialize'd to just that field, so editor mode/
// selection/shop-open state still resets every visit as before).
export const useHouseSceneStore = create<HouseSceneState>()(
  persist(
    (set) => ({
      isEditorMode: false,
      toggleEditorMode: () =>
        set((state) => ({
          isEditorMode: !state.isEditorMode,
          // Leaving Editor Mode always drops whatever was selected — there's
          // nothing to do with a selection once dragging/rotating it is gone.
          selectedItemId: state.isEditorMode ? null : state.selectedItemId,
        })),
      selectedItemId: null,
      setSelectedItemId: (id) => set({ selectedItemId: id }),
      isShopOpen: false,
      setShopOpen: (open) => set({ isShopOpen: open }),
      gizmoMode: "translate",
      setGizmoMode: (mode) => set({ gizmoMode: mode }),
      showGizmoArrows: false,
      setShowGizmoArrows: (show) => set({ showGizmoArrows: show }),
    }),
    {
      name: "house-scene-settings",
      partialize: (state) => ({ showGizmoArrows: state.showGizmoArrows }),
    },
  ),
);
