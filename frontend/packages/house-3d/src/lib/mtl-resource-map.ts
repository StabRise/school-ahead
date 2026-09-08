import * as THREE from "three";

export interface MtlTexture {
  url: string;
  filename: string;
}

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

// A .mtl file references its textures by original filename (e.g. `map_Kd
// diffuse.png`), resolved relative to wherever the .mtl itself was loaded
// from — but every upload is stored under a randomized name (see
// backend's common.storage._unique_path), so that reference never resolves
// as-is. This LoadingManager intercepts every resource fetch MTLLoader (and
// the TextureLoader it drives) makes and redirects filename matches
// (case-insensitive) to the actual uploaded texture URL — see
// house.schemas.FurnitureTextureOut's `filename`.
export function createMtlResourceManager(textures: MtlTexture[]): THREE.LoadingManager {
  const byFilename = new Map(textures.map((t) => [t.filename.toLowerCase(), t.url]));
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => byFilename.get(basename(url).toLowerCase()) ?? url);
  return manager;
}
