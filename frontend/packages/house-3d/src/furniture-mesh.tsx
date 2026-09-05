"use client";

import { useMemo, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { useLoader } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import type { GizmoMode } from "./stores/house-scene-store";

// A fully transparent 1x1 pixel, used as a stand-in URL when an item has no
// texture_file — keeps the texture-loading hook call unconditional (hooks
// can't be called conditionally) while never actually being rendered: see
// useFurnitureMaterial below.
const BLANK_TEXTURE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUAAScY42YAAAAASUVORK5CYII=";

function useFurnitureMaterial(textureUrl: string | null): THREE.Material {
  const texture = useLoader(THREE.TextureLoader, textureUrl ?? BLANK_TEXTURE_URL);
  return useMemo(() => {
    if (!textureUrl) {
      return new THREE.MeshStandardMaterial({ color: 0xcccccc });
    }
    // Mutate our own clone, never the texture the hook itself returned.
    const ownTexture = texture.clone();
    ownTexture.colorSpace = THREE.SRGBColorSpace;
    ownTexture.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: ownTexture });
  }, [texture, textureUrl]);
}

function ObjModel({ url, material }: { url: string; material: THREE.Material }) {
  // The reference Koltuk.obj (and any .obj lacking its sidecar .mtl) loads
  // with OBJLoader's own default material per mesh — see
  // house/models.py::FurnitureItem's docstring. We always override it with
  // our own resolved material (textured or neutral) so a missing .mtl never
  // matters.
  const group = useLoader(OBJLoader, url);
  const rendered = useMemo(() => {
    const clone = group.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [group, material]);
  return <primitive object={rendered} />;
}

function StlModel({ url, material }: { url: string; material: THREE.Material }) {
  const geometry = useLoader(STLLoader, url);
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}

export interface FurnitureMeshProps {
  modelUrl: string;
  modelFormat: "obj" | "stl";
  textureUrl: string | null;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  isSelected: boolean;
  gizmoMode: GizmoMode;
  onSelect: () => void;
  onTransformEnd: (position: [number, number, number], rotation: [number, number, number], scale: number) => void;
}

// One placed FurnitureItem in the 3D scene — see PlacedFurnitureItem on the
// backend. Clicking it selects it; while selected, a drei TransformControls
// gizmo (translate or rotate, toggled from the parent's UI) lets the
// student move/rotate it freely in all three axes, persisting on drag-end.
export function FurnitureMesh({
  modelUrl,
  modelFormat,
  textureUrl,
  position,
  rotation,
  scale,
  isSelected,
  gizmoMode,
  onSelect,
  onTransformEnd,
}: FurnitureMeshProps) {
  // A plain three.js object held in state (set via the `group` ref
  // callback below), not a React ref read during render — TransformControls
  // needs the actual Object3D instance to attach to, which only exists once
  // this component has mounted.
  const [groupObject, setGroupObject] = useState<THREE.Group | null>(null);
  const material = useFurnitureMaterial(textureUrl);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect();
  };

  const handleTransformEnd = () => {
    if (!groupObject) return;
    onTransformEnd(
      [groupObject.position.x, groupObject.position.y, groupObject.position.z],
      [groupObject.rotation.x, groupObject.rotation.y, groupObject.rotation.z],
      groupObject.scale.x,
    );
  };

  return (
    <>
      <group ref={setGroupObject} position={position} rotation={rotation} scale={scale} onClick={handleClick}>
        {modelFormat === "stl" ? (
          <StlModel url={modelUrl} material={material} />
        ) : (
          <ObjModel url={modelUrl} material={material} />
        )}
      </group>
      {isSelected && groupObject && (
        <TransformControls object={groupObject} mode={gizmoMode} onMouseUp={handleTransformEnd} />
      )}
    </>
  );
}
