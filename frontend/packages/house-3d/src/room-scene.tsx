"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { FurnitureItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import type { MeasuredBounds } from "./furniture-mesh";
import { FurnitureMesh } from "./furniture-mesh";
import { buildPanelWithHoles, panelSize, worldSizeToPanelSize, worldToPanelLocal } from "./lib/hole-geometry";
import type { HoleRect, PanelId } from "./lib/hole-geometry";
import { WALL_HEIGHT } from "./lib/room-constants";
import { nearestWall } from "./lib/surface";
import type { FurnitureKind, FurnitureSurface } from "./lib/surface";
import { useHouseSceneStore } from "./stores/house-scene-store";

// One flat room-shell segment (floor, ceiling, or one of the four walls) —
// see lib/hole-geometry.ts's PanelId. Always built via buildPanelWithHoles
// rather than a plain <planeGeometry>, even with an empty `holes` array, so
// a WITH_HOLE item's opening (house.models.FurnitureKind) can appear (or
// move, as the item is dragged) without swapping geometry types. `glass`
// panels (the front wall and ceiling, which would otherwise fully enclose
// the room) render see-through and skip raycasting, so a click aimed at
// furniture behind one still reaches it instead of hitting the glass.
function Panel({
  panelId,
  position,
  rotation,
  color,
  holes,
  glass = false,
}: {
  panelId: PanelId;
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
  holes: HoleRect[];
  glass?: boolean;
}) {
  const [width, height] = panelSize(panelId);
  const geometry = useMemo(() => buildPanelWithHoles(width, height, holes), [width, height, holes]);
  const ref = useRef<THREE.Mesh>(null);
  useEffect(() => {
    if (glass && ref.current) ref.current.raycast = () => {};
  }, [glass]);

  return (
    <mesh ref={ref} position={position} rotation={rotation} geometry={geometry} receiveShadow={!glass}>
      <meshStandardMaterial
        color={color}
        side={THREE.DoubleSide}
        transparent={glass}
        opacity={glass ? 0.2 : 1}
        depthWrite={!glass}
      />
    </mesh>
  );
}

// A plain primitive-geometry shell — floor, all four walls, and a
// ceiling — standing in for a modeled room asset. No Room catalog/model
// exists in v1: every student gets this one implicit room (see
// house/models.py's FurnitureItem docstring). The back/left/right walls
// stay opaque (the camera always looks in from the front); the front wall
// and ceiling are see-through so items stuck to them (or to the far side
// of the room) stay visible from outside. `holesByPanel` cuts an opening
// into whichever panel(s) currently host a WITH_HOLE item — see
// lib/hole-geometry.ts.
function RoomShell({ holesByPanel }: { holesByPanel: Record<PanelId, HoleRect[]> }) {
  return (
    <group>
      <Panel
        panelId="floor"
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        color="#e7e0d3"
        holes={holesByPanel.floor}
      />
      <Panel
        panelId="back"
        position={[0, WALL_HEIGHT / 2, -panelSize("back")[0] / 2]}
        rotation={[0, 0, 0]}
        color="#f4efe4"
        holes={holesByPanel.back}
      />
      <Panel
        panelId="left"
        position={[-panelSize("left")[0] / 2, WALL_HEIGHT / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        color="#f0e9dc"
        holes={holesByPanel.left}
      />
      <Panel
        panelId="right"
        position={[panelSize("right")[0] / 2, WALL_HEIGHT / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        color="#f0e9dc"
        holes={holesByPanel.right}
      />
      <Panel
        panelId="front"
        position={[0, WALL_HEIGHT / 2, panelSize("front")[0] / 2]}
        rotation={[0, Math.PI, 0]}
        color="#f4efe4"
        holes={holesByPanel.front}
        glass
      />
      <Panel
        panelId="ceiling"
        position={[0, WALL_HEIGHT, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        color="#ffffff"
        holes={holesByPanel.ceiling}
        glass
      />
    </group>
  );
}

export interface RoomSceneProps {
  placedItems: FurnitureItemOut[];
  onTransformEnd: (itemId: number, position: [number, number, number], rotation: [number, number, number], scale: number) => void;
  isEditorMode: boolean;
}

// The 3D room canvas — see house-view.tsx for the page composing this with
// the shop panel. Only items with a non-null `placement` are rendered here;
// owned-but-put-away items only show in the shop.
export function RoomScene({ placedItems, onTransformEnd, isEditorMode }: RoomSceneProps) {
  const selectedItemId = useHouseSceneStore((state) => state.selectedItemId);
  const setSelectedItemId = useHouseSceneStore((state) => state.setSelectedItemId);
  const gizmoMode = useHouseSceneStore((state) => state.gizmoMode);
  const showGizmoArrows = useHouseSceneStore((state) => state.showGizmoArrows);

  // Only populated for WITH_HOLE items (see furniture-mesh.tsx's
  // onMeasured) — everything else never touches this state.
  const [boundsById, setBoundsById] = useState<Record<number, MeasuredBounds>>({});

  // Disabled for the duration of any item drag (direct-drag or
  // TransformControls' gizmo — see furniture-mesh.tsx's onDraggingChange),
  // so the camera never fights the student for the same pointer.
  const [isDraggingItem, setIsDraggingItem] = useState(false);

  const holesByPanel = useMemo(() => {
    const holes: Record<PanelId, HoleRect[]> = {
      floor: [], ceiling: [], back: [], front: [], left: [], right: [],
    };
    for (const item of placedItems) {
      if (item.kind !== "with_hole" || !item.placement) continue;
      const bounds = boundsById[item.id];
      if (!bounds) continue;
      const panel: PanelId =
        item.surface === "wall"
          ? nearestWall(bounds.center.x, bounds.center.z)
          : (item.surface as "floor" | "ceiling");
      const { cx, cy } = worldToPanelLocal(panel, [bounds.center.x, bounds.center.y, bounds.center.z]);
      const { width, height } = worldSizeToPanelSize(panel, bounds.size);
      holes[panel].push({ cx, cy, width, height });
    }
    return holes;
  }, [placedItems, boundsById]);

  return (
    <Canvas
      shadows
      camera={{ position: [5, 4, 6], fov: 50 }}
      onPointerMissed={() => setSelectedItemId(null)}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 4]} intensity={1} castShadow />
      <Suspense fallback={null}>
        <RoomShell holesByPanel={holesByPanel} />
        {placedItems.map((item) =>
          item.placement ? (
            <FurnitureMesh
              key={item.id}
              modelUrl={item.model_file}
              modelFormat={item.model_format === "stl" ? "stl" : "obj"}
              materialUrl={item.material_file}
              textures={item.textures}
              surface={item.surface as FurnitureSurface}
              kind={item.kind as FurnitureKind}
              position={item.placement.position as [number, number, number]}
              rotation={item.placement.rotation as [number, number, number]}
              scale={item.placement.scale}
              isSelected={selectedItemId === item.id}
              isEditorMode={isEditorMode}
              gizmoMode={gizmoMode}
              showGizmoArrows={showGizmoArrows}
              onSelect={() => setSelectedItemId(item.id)}
              onTransformEnd={(position, rotation, scale) => onTransformEnd(item.id, position, rotation, scale)}
              onDraggingChange={setIsDraggingItem}
              onMeasured={(bounds) =>
                setBoundsById((prev) => {
                  const existing = prev[item.id];
                  if (
                    existing &&
                    existing.center.x === bounds.center.x &&
                    existing.center.y === bounds.center.y &&
                    existing.center.z === bounds.center.z &&
                    existing.size.x === bounds.size.x &&
                    existing.size.y === bounds.size.y &&
                    existing.size.z === bounds.size.z
                  ) {
                    return prev;
                  }
                  return { ...prev, [item.id]: bounds };
                })
              }
            />
          ) : null,
        )}
      </Suspense>
      <OrbitControls makeDefault enabled={!isDraggingItem} />
    </Canvas>
  );
}
