export type ModelFormat = "obj" | "stl";

// Defensive fallback — the server already sends `model_format` on
// FurnitureItemOut, so this is only consulted if that's ever missing.
export function resolveModelFormat(modelFileUrl: string): ModelFormat {
  return modelFileUrl.toLowerCase().endsWith(".stl") ? "stl" : "obj";
}
