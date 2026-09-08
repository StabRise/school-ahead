"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { FurnitureModel } from "./furniture-model";
import type { MtlTexture } from "./lib/mtl-resource-map";
import type { FurnitureSurface } from "./lib/surface";

const DIORAMA_SIZE = 3;
const DIORAMA_HEIGHT = 2.4;

// A three-sided corner (floor, back wall, ceiling) at editor scale — not
// room-scene.tsx's actual room, which is sized for a student to walk a
// camera around, not for a tight single-item preview. The panel matching
// the item's own `surface` is tinted to call out where it sticks.
function DioramaShell({ surface }: { surface: FurnitureSurface }) {
  const highlight = "#e2d9c8";
  const neutral = "#f4efe4";
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[DIORAMA_SIZE, DIORAMA_SIZE]} />
        <meshStandardMaterial color={surface === "floor" ? highlight : neutral} />
      </mesh>
      <mesh position={[0, DIORAMA_HEIGHT / 2, -DIORAMA_SIZE / 2]} receiveShadow>
        <planeGeometry args={[DIORAMA_SIZE, DIORAMA_HEIGHT]} />
        <meshStandardMaterial color={surface === "wall" ? highlight : neutral} />
      </mesh>
      <mesh position={[0, DIORAMA_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[DIORAMA_SIZE, DIORAMA_SIZE]} />
        <meshStandardMaterial color={surface === "ceiling" ? highlight : neutral} />
      </mesh>
    </group>
  );
}

function surfacePosition(surface: FurnitureSurface): [number, number, number] {
  if (surface === "wall") return [0, DIORAMA_HEIGHT / 2, -DIORAMA_SIZE / 2 + 0.05];
  if (surface === "ceiling") return [0, DIORAMA_HEIGHT - 0.02, 0];
  return [0, 0, 0];
}

export interface FurniturePreviewProps {
  modelUrl: string;
  modelFormat: "obj" | "stl";
  materialUrl: string | null;
  textures: MtlTexture[];
  surface: FurnitureSurface;
  scale: number;
  // The catalog's default_position — a small nudge off the surface (see
  // house.models.FurnitureItem), added to the diorama's fixed placement so
  // a tutor can see its effect (fixing a model that looks sunk into the
  // floor, or floating off the wall/ceiling) before it reaches a student's
  // room.
  position: [number, number, number];
  rotation: [number, number, number];
}

// A live 3D render of one catalog item sat in a small floor/wall/ceiling
// diorama matching its `surface` — the tutor furniture editor's preview
// (tutor-furniture-editor-page.tsx), so a tutor can see how an upload
// actually looks, and check its default scale/rotation/position, before it
// ever reaches a student's room. Orbit-only, no TransformControls/drag:
// this is a look, not an edit surface — scale/rotation/position come from
// the sliders next to it.
export function FurniturePreview({
  modelUrl,
  modelFormat,
  materialUrl,
  textures,
  surface,
  scale,
  position,
  rotation,
}: FurniturePreviewProps) {
  const basePosition = useMemo(() => surfacePosition(surface), [surface]);
  const groupPosition: [number, number, number] = [
    basePosition[0] + position[0],
    basePosition[1] + position[1],
    basePosition[2] + position[2],
  ];

  return (
    <Canvas shadows camera={{ position: [2.2, 1.8, 2.6], fov: 45 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 3, 2]} intensity={1} castShadow />
      <Suspense fallback={null}>
        <DioramaShell surface={surface} />
        <group position={groupPosition} rotation={rotation} scale={scale}>
          <FurnitureModel modelUrl={modelUrl} modelFormat={modelFormat} materialUrl={materialUrl} textures={textures} />
        </group>
      </Suspense>
      <OrbitControls makeDefault target={[0, DIORAMA_HEIGHT / 3, 0]} />
    </Canvas>
  );
}
