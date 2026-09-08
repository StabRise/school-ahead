import { describe, expect, it } from "vitest";
import { createMtlResourceManager } from "./mtl-resource-map";

describe("createMtlResourceManager", () => {
  it("resolves a bare filename reference to its uploaded URL", () => {
    const manager = createMtlResourceManager([{ url: "https://cdn.example/abc123.png", filename: "diffuse.png" }]);
    expect(manager.resolveURL("diffuse.png")).toBe("https://cdn.example/abc123.png");
  });

  it("resolves a path-prefixed reference by matching the basename", () => {
    const manager = createMtlResourceManager([{ url: "https://cdn.example/abc123.png", filename: "diffuse.png" }]);
    expect(manager.resolveURL("textures/diffuse.png")).toBe("https://cdn.example/abc123.png");
  });

  it("matches case-insensitively", () => {
    const manager = createMtlResourceManager([{ url: "https://cdn.example/abc123.png", filename: "Diffuse.PNG" }]);
    expect(manager.resolveURL("diffuse.png")).toBe("https://cdn.example/abc123.png");
  });

  it("leaves an unmatched reference untouched", () => {
    const manager = createMtlResourceManager([{ url: "https://cdn.example/abc123.png", filename: "diffuse.png" }]);
    expect(manager.resolveURL("normal.png")).toBe("normal.png");
  });

  it("picks the right texture among several", () => {
    const manager = createMtlResourceManager([
      { url: "https://cdn.example/abc123.png", filename: "diffuse.png" },
      { url: "https://cdn.example/def456.png", filename: "normal.png" },
    ]);
    expect(manager.resolveURL("normal.png")).toBe("https://cdn.example/def456.png");
  });
});
