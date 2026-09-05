"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { FurnitureItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { FurnitureMesh } from "./furniture-mesh";
import { WALL_HEIGHT, ROOM_SIZE } from "./lib/room-constants";
import type { FurnitureSurface } from "./lib/surface";
import { useHouseSceneStore } from "./stores/house-scene-store";

// The front wall and ceiling would otherwise fully enclose the room and
// block the camera's (and every click's) view of the inside — rendered
// see-through instead, purely so a WALL/CEILING item (see lib/surface.ts)
// has a visible surface to be stuck to from every camera angle. Raycasting
// is disabled on these panels (see the ref effect below) so a click aimed
// at furniture behind one still reaches it instead of hitting the glass.
function GlassPanel({
  position,
  rotation,
  size,
  color,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number];
  color: string;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useEffect(() => {
    if (ref.current) ref.current.raycast = () => {};
  }, []);
  return (
    <mesh ref={ref} position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

// A plain primitive-geometry shell — floor, all four walls, and a
// ceiling — standing in for a modeled room asset. No Room catalog/model
// exists in v1: every student gets this one implicit room (see
// house/models.py's FurnitureItem docstring). The back/left/right walls
// stay opaque (the camera always looks in from the front); the front wall
// and ceiling are see-through GlassPanels so items stuck to them (or to
// the far side of the room) stay visible from outside. `wallColor`/
// `floorColor` are the student's own pick (house.models.RoomStyle) — every
// wall shares the one wallColor (the front GlassPanel included) so picking
// a color changes the whole room consistently; the ceiling stays plain
// white, uninvolved in this customization.
function RoomShell({ wallColor, floorColor }: { wallColor: string; floorColor: string }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_SIZE, ROOM_SIZE]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>
      <mesh position={[0, WALL_HEIGHT / 2, -ROOM_SIZE / 2]} receiveShadow>
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      <mesh position={[-ROOM_SIZE / 2, WALL_HEIGHT / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      <mesh position={[ROOM_SIZE / 2, WALL_HEIGHT / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      <GlassPanel
        position={[0, WALL_HEIGHT / 2, ROOM_SIZE / 2]}
        rotation={[0, Math.PI, 0]}
        size={[ROOM_SIZE, WALL_HEIGHT]}
        color={wallColor}
      />
      <GlassPanel
        position={[0, WALL_HEIGHT, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        size={[ROOM_SIZE, ROOM_SIZE]}
        color="#ffffff"
      />
    </group>
  );
}

export interface RoomSceneProps {
  placedItems: FurnitureItemOut[];
  onTransformEnd: (itemId: number, position: [number, number, number], rotation: [number, number, number], scale: number) => void;
  isEditorMode: boolean;
  // Explicit prop (not read from the store directly) so house-view.tsx can
  // force this off in "kids" uiMode regardless of the store's own
  // (persisted, "normal"-mode-only) showGizmoArrows setting.
  showGizmoArrows: boolean;
  // The student's saved wall/floor colors (house.models.RoomStyle) — see
  // RoomShell above. house-view.tsx owns the fetch/save; this component
  // just renders whatever it's handed.
  wallColor: string;
  floorColor: string;
}

// The 3D room canvas — see house-view.tsx for the page composing this with
// the shop panel. Only items with a non-null `placement` are rendered here;
// owned-but-put-away items only show in the shop.
export function RoomScene({ placedItems, onTransformEnd, isEditorMode, showGizmoArrows, wallColor, floorColor }: RoomSceneProps) {
  const selectedItemId = useHouseSceneStore((state) => state.selectedItemId);
  const setSelectedItemId = useHouseSceneStore((state) => state.setSelectedItemId);
  const gizmoMode = useHouseSceneStore((state) => state.gizmoMode);

  // Disabled for the duration of any item drag (direct-drag or
  // TransformControls' gizmo — see furniture-mesh.tsx's onDraggingChange),
  // so the camera never fights the student for the same pointer.
  const [isDraggingItem, setIsDraggingItem] = useState(false);

  return (
    <Canvas
      shadows
      camera={{ position: [5, 4, 6], fov: 50 }}
      onPointerMissed={() => setSelectedItemId(null)}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 4]} intensity={1} castShadow />
      <Suspense fallback={null}>
        <RoomShell wallColor={wallColor} floorColor={floorColor} />
        {placedItems.map((item) =>
          item.placement ? (
            <FurnitureMesh
              key={item.id}
              modelUrl={item.model_file}
              modelFormat={item.model_format === "stl" ? "stl" : "obj"}
              materialUrl={item.material_file}
              textures={item.textures}
              surface={item.surface as FurnitureSurface}
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
            />
          ) : null,
        )}
      </Suspense>
      <OrbitControls makeDefault enabled={!isDraggingItem} />
    </Canvas>
  );
}
