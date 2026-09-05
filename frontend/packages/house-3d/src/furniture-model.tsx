"use client";

import { useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { createMtlResourceManager, type MtlTexture } from "./lib/mtl-resource-map";

// A fully transparent 1x1 pixel, used as a stand-in URL when an item has no
// texture at all — keeps the texture-loading hook call unconditional (hooks
// can't be called conditionally) while never actually being rendered: see
// useFurnitureMaterial below.
const BLANK_TEXTURE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUAAScY42YAAAAASUVORK5CYII=";

// Exported for furniture-preview.tsx, which renders the same model/material
// loading outside of a placed, draggable scene item.
export function useFurnitureMaterial(textureUrl: string | null): THREE.Material {
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

export function ObjModel({ url, material }: { url: string; material: THREE.Material }) {
  // A bare .obj with no material_file loads with OBJLoader's own default
  // material per mesh — see house/models.py::FurnitureItem's docstring. We
  // always override it with our own resolved material (single texture or
  // neutral) so a missing .mtl never matters.
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

export function StlModel({ url, material }: { url: string; material: THREE.Material }) {
  const geometry = useLoader(STLLoader, url);
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}

// An .obj rendered with its real .mtl materials, per mesh/group — unlike
// ObjModel above, this keeps whatever per-face materials MTLLoader resolved
// instead of overriding them with one flat material. materialUrl's texture
// references (`map_Kd diffuse.png`, ...) are redirected to the matching
// uploaded FurnitureTexture by filename via createMtlResourceManager, since
// upload storage always renames the file on disk (see backend's
// common.storage._unique_path) — the .mtl's own reference never resolves
// as a URL on its own.
function ObjModelWithMaterial({
  url,
  materialUrl,
  textures,
}: {
  url: string;
  materialUrl: string;
  textures: MtlTexture[];
}) {
  const materials = useLoader(MTLLoader, materialUrl, (loader) => {
    loader.manager = createMtlResourceManager(textures);
  });
  const group = useLoader(OBJLoader, url, (loader) => {
    materials.preload();
    loader.setMaterials(materials);
  });
  const rendered = useMemo(() => {
    const clone = group.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [group]);
  return <primitive object={rendered} />;
}

export interface FurnitureModelProps {
  modelUrl: string;
  modelFormat: "obj" | "stl";
  materialUrl: string | null;
  textures: MtlTexture[];
}

// Resolves one FurnitureItem's geometry + appearance: STL always gets a
// flat material (STL carries no per-face material info), and .obj either
// renders with its real uploaded .mtl (when material_file is set) or falls
// back to a flat material built from the first uploaded texture (or plain
// grey with none at all). Shared by furniture-mesh.tsx (a placed, draggable
// item) and furniture-preview.tsx (the tutor editor's static preview).
export function FurnitureModel({ modelUrl, modelFormat, materialUrl, textures }: FurnitureModelProps) {
  const flatMaterial = useFurnitureMaterial(textures[0]?.url ?? null);

  if (modelFormat === "stl") {
    return <StlModel url={modelUrl} material={flatMaterial} />;
  }
  if (materialUrl) {
    return <ObjModelWithMaterial url={modelUrl} materialUrl={materialUrl} textures={textures} />;
  }
  return <ObjModel url={modelUrl} material={flatMaterial} />;
}
