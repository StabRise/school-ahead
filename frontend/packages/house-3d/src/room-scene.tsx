"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { FurnitureItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { FurnitureMesh } from "./furniture-mesh";
import { useHouseSceneStore } from "./stores/house-scene-store";

const ROOM_SIZE = 8;
const WALL_HEIGHT = 4;

// A plain primitive-geometry shell — floor plus three walls, open on one
// side so OrbitControls can look in — standing in for a modeled room asset.
// No Room catalog/model exists in v1: every student gets this one implicit
// room (see house/models.py's FurnitureItem docstring).
function RoomShell() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_SIZE, ROOM_SIZE]} />
        <meshStandardMaterial color="#e7e0d3" />
      </mesh>
      <mesh position={[0, WALL_HEIGHT / 2, -ROOM_SIZE / 2]} receiveShadow>
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <meshStandardMaterial color="#f4efe4" />
      </mesh>
      <mesh position={[-ROOM_SIZE / 2, WALL_HEIGHT / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <meshStandardMaterial color="#f0e9dc" />
      </mesh>
      <mesh position={[ROOM_SIZE / 2, WALL_HEIGHT / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <meshStandardMaterial color="#f0e9dc" />
      </mesh>
    </group>
  );
}

export interface RoomSceneProps {
  placedItems: FurnitureItemOut[];
  onTransformEnd: (itemId: number, position: [number, number, number], rotation: [number, number, number], scale: number) => void;
}

// The 3D room canvas — see house-view.tsx for the page composing this with
// the shop panel. Only items with a non-null `placement` are rendered here;
// owned-but-put-away items only show in the shop.
export function RoomScene({ placedItems, onTransformEnd }: RoomSceneProps) {
  const selectedItemId = useHouseSceneStore((state) => state.selectedItemId);
  const setSelectedItemId = useHouseSceneStore((state) => state.setSelectedItemId);
  const gizmoMode = useHouseSceneStore((state) => state.gizmoMode);

  return (
    <Canvas
      shadows
      camera={{ position: [5, 4, 6], fov: 50 }}
      onPointerMissed={() => setSelectedItemId(null)}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 4]} intensity={1} castShadow />
      <Suspense fallback={null}>
        <RoomShell />
        {placedItems.map((item) =>
          item.placement ? (
            <FurnitureMesh
              key={item.id}
              modelUrl={item.model_file}
              modelFormat={item.model_format === "stl" ? "stl" : "obj"}
              textureUrl={item.texture_file}
              position={item.placement.position as [number, number, number]}
              rotation={item.placement.rotation as [number, number, number]}
              scale={item.placement.scale}
              isSelected={selectedItemId === item.id}
              gizmoMode={gizmoMode}
              onSelect={() => setSelectedItemId(item.id)}
              onTransformEnd={(position, rotation, scale) => onTransformEnd(item.id, position, rotation, scale)}
            />
          ) : null,
        )}
      </Suspense>
      <OrbitControls makeDefault />
    </Canvas>
  );
}
